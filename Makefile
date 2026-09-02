.PHONY: help install test lint typecheck check render docker-build docker-tag docker-push docker-release docker-test docker-cli-check frontend-install frontend-build frontend-test frontend-e2e frontend-audit client-install client-test client-lint client-typecheck client-check client-docker-build client-docker-tag client-docker-push client-docker-release client-docker-test

PYTHON ?= $(shell if [ -x .venv/bin/python ]; then printf '%s' '.venv/bin/python'; else printf '%s' 'python'; fi)
NPM ?= npm
DOCKER ?= docker
VERSION ?= $(shell $(PYTHON) -c 'import tomllib; print(tomllib.load(open("pyproject.toml", "rb"))["project"]["version"])')
IMAGE ?= korserver
REMOTE_IMAGE ?= r4venme/korserver
CLIENT_VERSION ?= $(shell $(PYTHON) -c 'import tomllib; print(tomllib.load(open("korclient/pyproject.toml", "rb"))["project"]["version"])')
CLIENT_IMAGE ?= korclient
CLIENT_REMOTE_IMAGE ?= r4venme/korclient

help:
	@printf '%s\n' 'Targets: install test lint typecheck check render docker-build docker-tag docker-push docker-release docker-test docker-cli-check frontend-install frontend-build frontend-test frontend-e2e frontend-audit'
	@printf '%s\n' 'Client targets: client-install client-test client-lint client-typecheck client-check client-docker-build client-docker-tag client-docker-push client-docker-release client-docker-test'

install:
	$(PYTHON) -m pip install -e '.[dev]'

test:
	$(PYTHON) -m pytest

lint:
	$(PYTHON) -m ruff check backend tests

typecheck:
	$(PYTHON) -m mypy backend

check: lint typecheck test

render:
	$(PYTHON) -m korserver --config config.example.yaml config render --dry-run

docker-build:
	$(DOCKER) build -t $(IMAGE):latest .

docker-tag:
	$(DOCKER) tag $(IMAGE):latest $(REMOTE_IMAGE):latest
	$(DOCKER) tag $(IMAGE):latest $(REMOTE_IMAGE):v$(VERSION)

docker-push:
	$(DOCKER) push $(REMOTE_IMAGE):latest
	$(DOCKER) push $(REMOTE_IMAGE):v$(VERSION)

docker-release: docker-build docker-tag docker-push

docker-test:
	$(DOCKER) build --target frontend-test -t korserver:frontend-test .
	$(DOCKER) build --target backend-test -t korserver:test .

docker-cli-check:
	$(DOCKER) run --rm --entrypoint korctl korserver:latest config render --dry-run

frontend-install:
	$(NPM) --prefix frontend ci

frontend-build: frontend-install
	$(NPM) --prefix frontend run build

frontend-test:
	$(NPM) --prefix frontend test

frontend-e2e:
	$(NPM) --prefix frontend run test:e2e

frontend-audit:
	$(NPM) --prefix frontend audit --audit-level=moderate

CLIENT_PYTHON ?= $(shell if [ -x .venv/bin/python ]; then printf '%s' '$(CURDIR)/.venv/bin/python'; else printf '%s' 'python'; fi)

client-install:
	cd korclient && $(CLIENT_PYTHON) -m pip install -e '.[dev]'

client-test:
	cd korclient && $(CLIENT_PYTHON) -m pytest

client-lint:
	cd korclient && $(CLIENT_PYTHON) -m ruff check backend tests

client-typecheck:
	cd korclient && $(CLIENT_PYTHON) -m mypy backend

client-check: client-lint client-typecheck client-test

client-docker-build:
	$(DOCKER) build -t $(CLIENT_IMAGE):latest korclient

client-docker-tag:
	$(DOCKER) tag $(CLIENT_IMAGE):latest $(CLIENT_REMOTE_IMAGE):latest
	$(DOCKER) tag $(CLIENT_IMAGE):latest $(CLIENT_REMOTE_IMAGE):v$(CLIENT_VERSION)

client-docker-push:
	$(DOCKER) push $(CLIENT_REMOTE_IMAGE):latest
	$(DOCKER) push $(CLIENT_REMOTE_IMAGE):v$(CLIENT_VERSION)

client-docker-release: client-docker-build client-docker-tag client-docker-push

client-docker-test:
	$(DOCKER) build --target backend-test -t $(CLIENT_IMAGE):test korclient
