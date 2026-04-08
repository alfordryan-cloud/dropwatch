#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# DROPWATCH Deployment Script
# ═══════════════════════════════════════════════════════════════════════════════

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi
    
    if [ ! -f .env ]; then
        log_warn ".env file not found, copying from .env.example"
        cp .env.example .env
        log_warn "Please edit .env with your configuration before continuing"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Generate secrets if not set
generate_secrets() {
    log_info "Checking secrets..."
    
    source .env
    
    if [ -z "$ENCRYPTION_KEY" ] || [ "$ENCRYPTION_KEY" == "CHANGE_ME_GENERATE_RANDOM_STRING" ]; then
        log_info "Generating ENCRYPTION_KEY..."
        NEW_KEY=$(openssl rand -hex 32)
        sed -i "s/ENCRYPTION_KEY=.*/ENCRYPTION_KEY=$NEW_KEY/" .env
    fi
    
    if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" == "CHANGE_ME_GENERATE_RANDOM_STRING" ]; then
        log_info "Generating JWT_SECRET..."
        NEW_SECRET=$(openssl rand -hex 32)
        sed -i "s/JWT_SECRET=.*/JWT_SECRET=$NEW_SECRET/" .env
    fi
    
    if [ -z "$DB_PASSWORD" ] || [ "$DB_PASSWORD" == "CHANGE_ME_SECURE_PASSWORD" ]; then
        log_info "Generating DB_PASSWORD..."
        NEW_PASS=$(openssl rand -base64 24 | tr -d '/+=')
        sed -i "s/DB_PASSWORD=.*/DB_PASSWORD=$NEW_PASS/" .env
    fi
    
    log_success "Secrets configured"
}

# Build images
build_images() {
    log_info "Building Docker images..."
    docker-compose build --parallel
    log_success "Images built"
}

# Start services
start_services() {
    log_info "Starting services..."
    docker-compose up -d
    
    log_info "Waiting for services to be healthy..."
    sleep 10
    
    # Check health
    if docker-compose ps | grep -q "unhealthy"; then
        log_error "Some services are unhealthy"
        docker-compose ps
        exit 1
    fi
    
    log_success "All services started"
}

# Run database migrations
run_migrations() {
    log_info "Running database migrations..."
    
    # Wait for postgres to be ready
    until docker-compose exec -T postgres pg_isready -U dropwatch; do
        log_info "Waiting for PostgreSQL..."
        sleep 2
    done
    
    # Schema is automatically applied via init script
    log_success "Database ready"
}

# Show status
show_status() {
    echo ""
    log_info "═══════════════════════════════════════════════════════════════"
    log_success "DROPWATCH Deployment Complete!"
    log_info "═══════════════════════════════════════════════════════════════"
    echo ""
    
    docker-compose ps
    
    echo ""
    log_info "Access Points:"
    echo "  • Dashboard:  http://localhost:${UI_PORT:-80}"
    echo "  • API:        http://localhost:${API_PORT:-3000}"
    echo "  • Prometheus: http://localhost:${PROMETHEUS_PORT:-9090} (if monitoring enabled)"
    echo "  • Grafana:    http://localhost:${GRAFANA_PORT:-3001} (if monitoring enabled)"
    echo ""
    log_info "Commands:"
    echo "  • View logs:     docker-compose logs -f"
    echo "  • Stop:          docker-compose down"
    echo "  • Restart:       docker-compose restart"
    echo "  • Enable monitoring: docker-compose --profile monitoring up -d"
    echo ""
}

# Backup database
backup_database() {
    log_info "Creating database backup..."
    BACKUP_FILE="backup-$(date +%Y%m%d-%H%M%S).sql"
    docker-compose exec -T postgres pg_dump -U dropwatch dropwatch > "backups/$BACKUP_FILE"
    log_success "Backup created: backups/$BACKUP_FILE"
}

# Main
main() {
    case "${1:-deploy}" in
        deploy)
            check_prerequisites
            generate_secrets
            build_images
            start_services
            run_migrations
            show_status
            ;;
        start)
            docker-compose up -d
            show_status
            ;;
        stop)
            docker-compose down
            log_success "Services stopped"
            ;;
        restart)
            docker-compose restart
            show_status
            ;;
        logs)
            docker-compose logs -f ${2:-}
            ;;
        status)
            docker-compose ps
            ;;
        backup)
            mkdir -p backups
            backup_database
            ;;
        update)
            log_info "Pulling latest images..."
            docker-compose pull
            docker-compose up -d
            show_status
            ;;
        monitoring)
            log_info "Starting with monitoring stack..."
            docker-compose --profile monitoring up -d
            show_status
            ;;
        *)
            echo "Usage: $0 {deploy|start|stop|restart|logs|status|backup|update|monitoring}"
            exit 1
            ;;
    esac
}

main "$@"
