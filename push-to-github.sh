#!/bin/bash

# Script to push RemoteTv project to GitHub
# Usage: ./push-to-github.sh [GITHUB_TOKEN]

set -e  # Exit on error

REPO_NAME="RemoteTv"
GITHUB_USER="sharanm09"
GITHUB_TOKEN="${1:-}"

echo "🚀 Starting GitHub push process for $REPO_NAME..."

# Check if token is provided
if [ -z "$GITHUB_TOKEN" ]; then
    echo "📝 Please enter your GitHub Personal Access Token:"
    read -s GITHUB_TOKEN
    echo ""
fi

if [ -z "$GITHUB_TOKEN" ]; then
    echo "❌ Error: GitHub token is required!"
    echo "   Get your token from: https://github.com/settings/tokens"
    exit 1
fi

# Step 1: Add all files
echo "📦 Adding all files to git..."
git add .

# Step 2: Check if there are changes to commit
if git diff --staged --quiet; then
    echo "⚠️  No changes to commit. Checking if we need to create initial commit..."
    if [ -z "$(git log --oneline -1 2>/dev/null)" ]; then
        echo "📝 Creating initial commit..."
        git commit -m "Initial commit" || echo "⚠️  Commit may have failed or already exists"
    else
        echo "✅ Already have commits. Skipping commit step."
    fi
else
    echo "📝 Creating commit..."
    git commit -m "Initial commit"
fi

# Step 3: Create GitHub repository
echo "🔨 Creating GitHub repository '$REPO_NAME'..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/user/repos \
  -d "{\"name\":\"$REPO_NAME\",\"description\":\"Remote TV Control System\",\"private\":false}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 201 ]; then
    echo "✅ Repository created successfully!"
elif [ "$HTTP_CODE" -eq 422 ]; then
    echo "⚠️  Repository may already exist. Continuing..."
elif [ "$HTTP_CODE" -eq 401 ]; then
    echo "❌ Error: Invalid token or unauthorized!"
    exit 1
else
    echo "⚠️  Unexpected response (HTTP $HTTP_CODE): $BODY"
    echo "   Continuing anyway..."
fi

# Step 4: Add remote (remove if exists, then add)
echo "🔗 Setting up remote..."
git remote remove origin 2>/dev/null || true
git remote add origin https://github.com/$GITHUB_USER/$REPO_NAME.git

# Step 5: Rename branch to main if needed
echo "🌿 Ensuring branch is named 'main'..."
git branch -M main 2>/dev/null || true

# Step 6: Push to GitHub
echo "📤 Pushing to GitHub..."
git push -u origin main

echo ""
echo "✅ Successfully pushed to GitHub!"
echo "🔗 Repository URL: https://github.com/$GITHUB_USER/$REPO_NAME"
echo ""
echo "🎉 Done!"
