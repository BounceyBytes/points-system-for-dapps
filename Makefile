.PHONY: help install dev build start test lint format clean docker-up docker-down db-migrate db-seed db-studio

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install dependencies
	npm install

dev: ## Run development server with watch
	npm run dev:watch

build: ## Build TypeScript
	npm run build

start: ## Start production server
	npm start

test: ## Run tests
	npm test

test-coverage: ## Run tests with coverage
	npm run test:coverage

lint: ## Run linter
	npm run lint

format: ## Format code with Prettier
	npm run format

clean: ## Clean build artifacts
	rm -rf dist node_modules coverage logs

docker-up: ## Start all services with Docker
	docker-compose up -d

docker-down: ## Stop all Docker services
	docker-compose down

docker-logs: ## View Docker logs
	docker-compose logs -f

db-generate: ## Generate Prisma Client
	npm run db:generate

db-migrate: ## Run database migrations
	npm run db:migrate

db-seed: ## Seed database
	npm run db:seed

db-studio: ## Open Prisma Studio
	npm run db:studio

db-reset: ## Reset database (WARNING: deletes all data)
	npx prisma migrate reset --force

setup: install db-generate db-migrate db-seed ## Full setup (install + database)

run: docker-up ## Start the application with Docker
