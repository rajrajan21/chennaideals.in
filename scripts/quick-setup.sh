#!/bin/bash

# ChennaiDeals.in - Quick Start Setup Script
# This script automates the initial setup process

set -e  # Exit on error

echo ""
echo "================================"
echo "ChennaiDeals.in - Quick Setup"
echo "================================"
echo ""

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored messages
print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

# Step 1: Check prerequisites
echo ""
echo "Step 1: Checking Prerequisites..."
echo ""

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    print_success "Node.js installed: $NODE_VERSION"
else
    print_error "Node.js not found. Please install Node.js >= 22.22.0"
    exit 1
fi

# Check npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    print_success "npm installed: $NPM_VERSION"
else
    print_error "npm not found. Please install npm >= 10.0.0"
    exit 1
fi

# Check MySQL
if command -v mysql &> /dev/null; then
    print_success "MySQL installed"
else
    print_warning "MySQL not found. You'll need to set up the database manually."
fi

# Check Git
if command -v git &> /dev/null; then
    print_success "Git installed"
else
    print_warning "Git not found"
fi

# Step 2: Install dependencies
echo ""
echo "Step 2: Installing Dependencies..."
echo ""

if [ -d "node_modules" ] && [ -f "package-lock.json" ]; then
    print_warning "node_modules already exists. Skipping npm install."
    print_info "Run 'npm install' manually if you want to reinstall."
else
    print_info "Running: npm install"
    npm install
    if [ $? -eq 0 ]; then
        print_success "Dependencies installed successfully"
    else
        print_error "Failed to install dependencies"
        exit 1
    fi
fi

# Step 3: Environment setup
echo ""
echo "Step 3: Environment Setup..."
echo ""

if [ -f ".env.local" ]; then
    print_warning ".env.local already exists"
    print_info "Review your environment variables:"
    echo ""
    grep -E "^[A-Z_]+=" .env.local | head -5
    echo "  ..."
else
    print_info "Creating .env.local from env.example..."
    if [ -f "env.example" ]; then
        cp env.example .env.local
        print_success ".env.local created from env.example"
        print_warning "IMPORTANT: Edit .env.local with your database credentials:"
        echo "  - DATABASE_URL"
        echo "  - AUTH_SECRET"
        echo "  - VITE_APP_URL"
    else
        print_error "env.example not found"
    fi
fi

# Step 4: Database setup (optional)
echo ""
echo "Step 4: Database Setup..."
echo ""

read -p "Do you want to run database migrations now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_info "Running: npx drizzle-kit push"
    npx drizzle-kit push
    if [ $? -eq 0 ]; then
        print_success "Database migrations completed"
    else
        print_warning "Database migration may have failed. Check your DATABASE_URL in .env.local"
    fi
else
    print_warning "Skipping migrations. Run 'npx drizzle-kit push' manually when ready."
fi

# Step 5: Verify setup
echo ""
echo "Step 5: Verification..."
echo ""

print_info "Running TypeScript check...
npm run type-check 2>&1 | tail -1

print_success "Setup complete!"

# Summary
echo ""
echo "================================"
echo "Setup Summary"
echo "================================"
echo ""
echo "Next steps:"
echo ""
echo "1. Edit .env.local with your configuration:"
echo "   nano .env.local"
echo ""
echo "2. Ensure database is running and migrations applied"
echo ""
echo "3. Start the development server:"
echo "   npm run dev"
echo ""
echo "4. Open browser to:"
echo "   http://localhost:5173"
echo ""
echo "5. Run tests anytime:"
echo "   npm test"
echo ""
echo "================================"
echo ""
