#!/bin/bash

# Master Deployment Script
# This script automates the entire deployment process

set -e

echo "=========================================="
echo "  AIAgent EC2 Deployment Script"
echo "=========================================="

# Configuration
EC2_IP="3.208.52.220"
EC2_USER="ubuntu"
EC2_KEY_PATH="${1:-./your-aws-key.pem}"
DEPLOYMENT_FILE="aiagent-deployment.tar.gz"

# Check if deployment file exists
if [ ! -f "$DEPLOYMENT_FILE" ]; then
    echo "ERROR: $DEPLOYMENT_FILE not found!"
    echo "Usage: ./DEPLOY_TO_EC2.sh /path/to/your-aws-key.pem"
    exit 1
fi

# Check if AWS key exists
if [ ! -f "$EC2_KEY_PATH" ]; then
    echo "ERROR: AWS key file not found: $EC2_KEY_PATH"
    echo "Usage: ./DEPLOY_TO_EC2.sh /path/to/your-aws-key.pem"
    exit 1
fi

echo "Deploying to: $EC2_IP"
echo "Using key: $EC2_KEY_PATH"
echo ""

# Upload files
echo "1. Uploading deployment package..."
scp -i "$EC2_KEY_PATH" "$DEPLOYMENT_FILE" "${EC2_USER}@${EC2_IP}:/tmp/"

# Run installation on remote server
echo "2. Installing on remote server..."
ssh -i "$EC2_KEY_PATH" "${EC2_USER}@${EC2_IP}" << 'REMOTE_INSTALL'
#!/bin/bash
set -e
cd /tmp
tar -xzf aiagent-deployment.tar.gz
cd aiagent-deployment
chmod +x install.sh
./install.sh
REMOTE_INSTALL

echo ""
echo "=========================================="
echo "  Deployment Complete!"
echo "=========================================="
echo ""
echo "NEXT STEPS:"
echo "1. SSH to your server:"
echo "   ssh -i $EC2_KEY_PATH ${EC2_USER}@${EC2_IP}"
echo ""
echo "2. Configure environment:"
echo "   nano /home/ubuntu/aiagent/.env.production"
echo "   - Update MONGODB_URI"
echo "   - Generate SESSION_SECRET"
echo ""
echo "3. Restart Apache:"
echo "   sudo systemctl restart apache2"
echo ""
echo "4. Start the application:"
echo "   /home/ubuntu/aiagent/start.sh"
echo ""
echo "5. Access your application:"
echo "   https://nijvox.com/"
echo ""
