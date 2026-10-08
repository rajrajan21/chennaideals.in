#!/bin/bash

# ChennaiDeals.in - Complete Testing Script
# Run all tests before deployment

set -e

echo ""
echo "================================"
echo "ChennaiDeals.in - Test Suite"
echo "================================"
echo ""

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_section() {
    echo ""
    echo "================================"
    echo "$1"
    echo "================================"
    echo ""
}

FAILED_TESTS=0

# Phase 1: Environment Check
print_section "Phase 1: Environment Check"

if npm list --depth=0 > /dev/null 2>&1; then
    print_success "Dependencies installed"
else
    print_error "Dependencies not installed. Run 'npm install'"
    ((FAILED_TESTS++))
fi

if [ -f ".env.local" ]; then
    print_success "Environment file exists"
else
    print_error "Environment file missing. Run 'cp env.example .env.local'"
    ((FAILED_TESTS++))
fi

# Phase 2: Type Checking
print_section "Phase 2: TypeScript Type Checking"

if npm run type-check 2>&1 | grep -q "error TS"; then
    print_error "TypeScript errors found"
    npm run type-check
    ((FAILED_TESTS++))
else
    print_success "All TypeScript checks passed"
fi

# Phase 3: Linting
print_section "Phase 3: ESLint Validation"

if npm run lint 2>&1 | grep -E "error|Error" > /dev/null; then
    print_error "Lint errors found"
    npm run lint
    ((FAILED_TESTS++))
else
    print_success "All lint checks passed"
fi

# Phase 4: Unit Tests
print_section "Phase 4: Unit Tests"

if npm test -- --run 2>&1 | grep -q "FAIL\|failed"; then
    print_error "Some tests failed"
    npm test -- --run
    ((FAILED_TESTS++))
else
    print_success "All unit tests passed"
    npm test -- --run 2>&1 | tail -5
fi

# Phase 5: Test Coverage
print_section "Phase 5: Test Coverage"

print_success "Generating coverage report..."
npm run test:coverage -- --run 2>&1 | tail -10

# Phase 6: Build Test
print_section "Phase 6: Production Build"

if npm run build 2>&1 | grep -q "error\|failed\|Error"; then
    print_error "Build failed"
    ((FAILED_TESTS++))
else
    print_success "Production build succeeded"
    echo ""
    echo "Build artifacts:"
    ls -lh dist/index.html dist/assets/ 2>/dev/null | head -10
fi

# Phase 7: Security Audit
print_section "Phase 7: Security Audit"

if npm run audit 2>&1 | grep -q "vulnerabilities"; then
    VULN_COUNT=$(npm run audit 2>&1 | grep -o "[0-9]* vulnerabilities" | head -1)
    print_error "Security vulnerabilities found: $VULN_COUNT"
    ((FAILED_TESTS++))
else
    print_success "No security vulnerabilities found"
fi

# Summary
print_section "Test Summary"

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}════════════════════════════════${NC}"
    echo -e "${GREEN}✓ ALL TESTS PASSED - READY TO DEPLOY${NC}"
    echo -e "${GREEN}════════════════════════════════${NC}"
    echo ""
    exit 0
else
    echo -e "${RED}════════════════════════════════${NC}"
    echo -e "${RED}✗ $FAILED_TESTS TEST(S) FAILED${NC}"
    echo -e "${RED}════════════════════════════════${NC}"
    echo ""
    exit 1
fi
