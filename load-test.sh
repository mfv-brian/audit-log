#!/bin/bash

# Load Testing Script for Audit Logs API
# Usage: ./load-test.sh [interval_seconds] [requests_per_interval]

# Default values
INTERVAL=${1:-10}  # Default: 1 second
REQUESTS_PER_INTERVAL=${2:-1}  # Default: 3 requests

# API Configuration
API_BASE_URL="http://localhost:8000/api/v1"
LOGIN_ENDPOINT="/login/access-token"
AUDIT_LOGS_ENDPOINT="/audit-logs/"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Function to load environment variables
load_env_vars() {
    # Try to load from .env file if it exists
    if [ -f ".env" ]; then
        print_status "Loading credentials from .env file..."
        export $(grep -v '^#' .env | xargs)
    else
        print_warning ".env file not found, using default credentials"
    fi
    
    # Set default values if not provided
    USERNAME=${FIRST_SUPERUSER:-"admin@example.com"}
    PASSWORD=${FIRST_SUPERUSER_PASSWORD:-"changethis"}
    
    print_status "Using username: $USERNAME"
}

# Function to get access token
get_access_token() {
    print_status "Getting access token..."
    
    TOKEN_RESPONSE=$(curl -s -X POST "${API_BASE_URL}${LOGIN_ENDPOINT}" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "username=$USERNAME&password=$PASSWORD")
    
    if [ $? -eq 0 ]; then
        ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
        if [ -n "$ACCESS_TOKEN" ]; then
            print_success "Access token obtained successfully"
            return 0
        else
            print_error "Failed to extract access token from response"
            print_error "Response: $TOKEN_RESPONSE"
            return 1
        fi
    else
        print_error "Failed to get access token"
        return 1
    fi
}

# Function to generate random audit log data
generate_random_audit_data() {
    # Random action types
    ACTIONS=("CREATE" "UPDATE" "DELETE" "VIEW" "LOGIN" "LOGOUT" "EXPORT" "IMPORT")
    RANDOM_ACTION=${ACTIONS[$RANDOM % ${#ACTIONS[@]}]}
    
    # Random resource types
    RESOURCE_TYPES=("user" "item" "document" "file" "order" "product" "customer" "transaction")
    RANDOM_RESOURCE_TYPE=${RESOURCE_TYPES[$RANDOM % ${#RESOURCE_TYPES[@]}]}
    
    # Random resource ID
    RANDOM_RESOURCE_ID="resource-$(date +%s)-$RANDOM"
    
    # Random severity levels
    SEVERITIES=("INFO" "WARNING" "ERROR" "CRITICAL")
    RANDOM_SEVERITY=${SEVERITIES[$RANDOM % ${#SEVERITIES[@]}]}
    
    # Random tenant IDs
    TENANT_IDS=("tenant-main" "tenant-secondary" "tenant-dev" "tenant-prod" "tenant-test" "tenant-staging")
    RANDOM_TENANT_ID=${TENANT_IDS[$RANDOM % ${#TENANT_IDS[@]}]}
    
    # Random IP addresses
    IPS=("192.168.1.100" "10.0.0.50" "172.16.0.25" "203.0.113.10" "198.51.100.5")
    RANDOM_IP=${IPS[$RANDOM % ${#IPS[@]}]}
    
    # Simplified user agents to avoid JSON escaping issues
    USER_AGENTS=(
        "Mozilla/5.0 Windows"
        "Mozilla/5.0 Macintosh"
        "Mozilla/5.0 Linux"
        "Mozilla/5.0 iPhone"
        "Mozilla/5.0 Android"
    )
    RANDOM_USER_AGENT=${USER_AGENTS[$RANDOM % ${#USER_AGENTS[@]}]}
    
    # Random metadata (simplified)
    METADATA_OPTIONS=(
        '{"source":"web_interface","session_id":"sess-123"}'
        '{"source":"api","client_version":"1.2.3"}'
        '{"source":"mobile_app","device_id":"dev-456"}'
        '{"source":"batch_job","job_id":"job-789"}'
        '{"source":"admin_panel","admin_id":"admin-001"}'
    )
    RANDOM_METADATA=${METADATA_OPTIONS[$RANDOM % ${#METADATA_OPTIONS[@]}]}
    
    # Create JSON payload using jq for proper JSON formatting
    if command -v jq &> /dev/null; then
        jq -n \
            --arg action "$RANDOM_ACTION" \
            --arg resource_type "$RANDOM_RESOURCE_TYPE" \
            --arg resource_id "$RANDOM_RESOURCE_ID" \
            --arg severity "$RANDOM_SEVERITY" \
            --arg tenant_id "$RANDOM_TENANT_ID" \
            --arg user_agent "$RANDOM_USER_AGENT" \
            --arg ip_address "$RANDOM_IP" \
            --arg custom_metadata "$RANDOM_METADATA" \
            '{
                action: $action,
                resource_type: $resource_type,
                resource_id: $resource_id,
                severity: $severity,
                tenant_id: $tenant_id,
                user_agent: $user_agent,
                ip_address: $ip_address,
                custom_metadata: $custom_metadata
            }'
    else
        # Fallback to printf if jq is not available
        printf '{"action":"%s","resource_type":"%s","resource_id":"%s","severity":"%s","tenant_id":"%s","user_agent":"%s","ip_address":"%s","custom_metadata":"%s"}' \
            "$RANDOM_ACTION" \
            "$RANDOM_RESOURCE_TYPE" \
            "$RANDOM_RESOURCE_ID" \
            "$RANDOM_SEVERITY" \
            "$RANDOM_TENANT_ID" \
            "$RANDOM_USER_AGENT" \
            "$RANDOM_IP" \
            "$RANDOM_METADATA"
    fi
}

# Function to send a single audit log request
send_audit_request() {
    local request_num=$1
    local total_requests=$2
    
    print_status "Sending request $request_num/$total_requests..."
    
    # Generate random audit data
    AUDIT_DATA=$(generate_random_audit_data)
    
    # Send request
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_BASE_URL}${AUDIT_LOGS_ENDPOINT}" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        -d "$AUDIT_DATA")
    
    # Extract HTTP status code (last line)
    HTTP_STATUS=$(echo "$RESPONSE" | tail -1)
    # Extract response body (all lines except the last one)
    RESPONSE_BODY=$(echo "$RESPONSE" | sed '$d')
    
    if [ "$HTTP_STATUS" -eq 200 ] || [ "$HTTP_STATUS" -eq 201 ]; then
        print_success "Request $request_num/$total_requests completed (HTTP $HTTP_STATUS)"
        echo "$AUDIT_DATA" | jq -r '.action + " -> " + .resource_type + ":" + .resource_id + " (tenant: " + .tenant_id + ")"' 2>/dev/null || echo "Data sent successfully"
    else
        print_error "Request $request_num/$total_requests failed (HTTP $HTTP_STATUS)"
        echo "Response: $RESPONSE_BODY"
    fi
}

# Function to send batch of requests
send_batch_requests() {
    local batch_num=$1
    local total_requests=$2
    
    print_status "Starting batch $batch_num (sending $total_requests requests)..."
    
    for i in $(seq 1 $total_requests); do
        send_audit_request $i $total_requests &
    done
    
    # Wait for all requests in this batch to complete
    wait
    
    print_success "Batch $batch_num completed"
}

# Main execution
main() {
    print_status "Starting Load Test for Audit Logs API"
    print_status "Configuration: $REQUESTS_PER_INTERVAL requests every $INTERVAL second(s)"
    print_status "API Base URL: $API_BASE_URL"
    echo
    
    # Check if jq is available for JSON formatting
    if ! command -v jq &> /dev/null; then
        print_warning "jq is not installed. JSON output will not be formatted."
    fi
    
    # Load environment variables
    load_env_vars
    
    # Get access token
    if ! get_access_token; then
        print_error "Cannot proceed without access token"
        exit 1
    fi
    
    echo
    print_status "Starting load test loop. Press Ctrl+C to stop."
    echo
    
    batch_counter=1
    
    # Main loop
    while true; do
        send_batch_requests $batch_counter $REQUESTS_PER_INTERVAL
        echo
        
        # Wait for the specified interval
        if [ "$INTERVAL" -gt 0 ]; then
            print_status "Waiting $INTERVAL second(s) before next batch..."
            sleep "$INTERVAL"
        fi
        
        batch_counter=$((batch_counter + 1))
    done
}

# Handle script interruption
cleanup() {
    echo
    print_status "Load test interrupted. Cleaning up..."
    print_status "Load test completed."
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Check if curl is available
if ! command -v curl &> /dev/null; then
    print_error "curl is required but not installed."
    exit 1
fi

# Run main function
main 