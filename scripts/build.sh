#!/bin/bash

# =============================================================================
# Agent OS Build Script
# Compiles TypeScript scripts to standalone single-file executables using Bun
# =============================================================================
#
# USAGE:
#   ./build.sh [options]
#
# OPTIONS:
#   -p, --profile <name>    Profile to build scripts for (default: all profiles)
#   -s, --script <name>     Build specific script only (e.g., spec-to-implementation)
#   -v, --verbose           Show detailed output
#   -d, --dry-run           Show what would be built without building
#   -h, --help              Show this help message
#
# EXAMPLES:
#   ./build.sh                                    # Build all scripts in all profiles
#   ./build.sh -p christopher-default             # Build scripts for specific profile
#   ./build.sh -s spec-to-implementation          # Build specific script
#   ./build.sh -p christopher-default -v          # Verbose output for profile
#
# INPUT/OUTPUT LOCATIONS:
#   Input:  agent-os-dev/profiles/<profile>/scripts/*.ts
#   Output: agent-os-dev/profiles/<profile>/scripts/<script-name> (no extension)
#
# PROFILE INHERITANCE:
#   Scripts follow the same inheritance pattern as other profile files.
#   When building, each profile's scripts directory is compiled independently.
#   A script in a child profile will override the same-named script from parent.
#
# REQUIREMENTS:
#   - Bun runtime (https://bun.sh)
#   - macOS ARM architecture (darwin-arm64)
#
# HOW IT WORKS:
#   1. Scans profile scripts directories for .ts files
#   2. Compiles each .ts file to a standalone binary using `bun build --compile`
#   3. Outputs binary with same name, no extension (e.g., foo.ts -> foo)
#   4. Target: macOS ARM only (bun-darwin-arm64)
#   5. Simple compilation only - no tests, linting, or type-checking
#
# =============================================================================

set -e

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[38;2;255;32;86m'
GREEN='\033[38;2;0;234;179m'
YELLOW='\033[38;2;255;185;0m'
BLUE='\033[38;2;0;208;255m'
NC='\033[0m' # No Color

# Default options
PROFILE=""
SCRIPT_NAME=""
VERBOSE=false
DRY_RUN=false

# Print colored output
print_color() {
    local color=$1
    shift
    echo -e "${color}$@${NC}"
}

print_status() {
    print_color "$BLUE" "$1"
}

print_success() {
    print_color "$GREEN" "✓ $1"
}

print_warning() {
    print_color "$YELLOW" "⚠ $1"
}

print_error() {
    print_color "$RED" "✗ $1"
}

print_verbose() {
    if [[ "$VERBOSE" == "true" ]]; then
        echo "[VERBOSE] $1"
    fi
}

# Show usage
show_help() {
    head -50 "$0" | grep -E "^#" | sed 's/^# //' | sed 's/^#//'
    exit 0
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -p|--profile)
            PROFILE="$2"
            shift 2
            ;;
        -s|--script)
            SCRIPT_NAME="$2"
            shift 2
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -d|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            show_help
            ;;
        *)
            print_error "Unknown option: $1"
            echo "Use -h or --help for usage information"
            exit 1
            ;;
    esac
done

# Check for bun
if ! command -v bun &> /dev/null; then
    print_error "Bun is not installed"
    echo "Install Bun: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

# Get bun version
BUN_VERSION=$(bun --version)
print_verbose "Bun version: $BUN_VERSION"

# Build a single TypeScript file
build_script() {
    local source_file=$1
    local output_dir=$(dirname "$source_file")
    local filename=$(basename "$source_file" .ts)
    local output_file="$output_dir/$filename"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        echo "Would build: $source_file -> $output_file"
        return 0
    fi
    
    print_verbose "Building: $source_file"
    
    # Compile with Bun
    # --compile: Create a standalone executable
    # --target=bun-darwin-arm64: Target macOS ARM
    if bun build --compile --target=bun-darwin-arm64 "$source_file" --outfile "$output_file" 2>&1; then
        print_success "Built: $filename"
        return 0
    else
        print_error "Failed to build: $filename"
        return 1
    fi
}

# Build all scripts in a profile
build_profile() {
    local profile_name=$1
    local profile_dir="$BASE_DIR/profiles/$profile_name"
    local scripts_dir="$profile_dir/scripts"
    
    if [[ ! -d "$scripts_dir" ]]; then
        print_verbose "No scripts directory in profile: $profile_name"
        return 0
    fi
    
    print_status "Building scripts for profile: $profile_name"
    
    local count=0
    local failed=0
    
    # Find all .ts files in the scripts directory
    while IFS= read -r -d '' ts_file; do
        # Skip if looking for specific script
        if [[ -n "$SCRIPT_NAME" ]]; then
            local basename=$(basename "$ts_file" .ts)
            if [[ "$basename" != "$SCRIPT_NAME" ]]; then
                continue
            fi
        fi
        
        if build_script "$ts_file"; then
            ((count++)) || true
        else
            ((failed++)) || true
        fi
    done < <(find "$scripts_dir" -maxdepth 1 -name "*.ts" -type f -print0 2>/dev/null)
    
    if [[ $count -gt 0 ]] || [[ $failed -gt 0 ]]; then
        if [[ $failed -eq 0 ]]; then
            print_success "Built $count script(s) for $profile_name"
        else
            print_warning "Built $count script(s), $failed failed for $profile_name"
        fi
    else
        print_verbose "No TypeScript scripts found in $profile_name"
    fi
    
    return $failed
}

# Main execution
main() {
    echo ""
    print_status "Agent OS Build Pipeline"
    echo ""
    
    local total_failed=0
    
    if [[ -n "$PROFILE" ]]; then
        # Build specific profile
        if [[ ! -d "$BASE_DIR/profiles/$PROFILE" ]]; then
            print_error "Profile not found: $PROFILE"
            exit 1
        fi
        build_profile "$PROFILE" || ((total_failed++)) || true
    else
        # Build all profiles
        for profile_dir in "$BASE_DIR/profiles"/*/; do
            if [[ -d "$profile_dir" ]]; then
                local profile_name=$(basename "$profile_dir")
                build_profile "$profile_name" || ((total_failed++)) || true
            fi
        done
    fi
    
    echo ""
    if [[ $total_failed -eq 0 ]]; then
        print_success "Build complete!"
    else
        print_error "Build completed with errors"
        exit 1
    fi
}

# Run main
main
