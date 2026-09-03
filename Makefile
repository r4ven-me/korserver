.PHONY: help install test lint typecheck check render docker-build docker-tag docker-push docker-release docker-test docker-cli-check frontend-install frontend-build frontend-test frontend-e2e frontend-audit release

PYTHON ?= $(shell if [ -x .venv/bin/python ]; then printf '%s' '.venv/bin/python'; else printf '%s' 'python'; fi)
NPM ?= npm
DOCKER ?= docker
GIT ?= git
VERSION ?= $(shell $(PYTHON) -c 'import tomllib; print(tomllib.load(open("pyproject.toml", "rb"))["project"]["version"])')
IMAGE ?= korserver
REMOTE_IMAGE ?= r4venme/korserver
GHCR_IMAGE ?= ghcr.io/r4ven-me/korserver
MSG ?= Release v$(VERSION)

help:
	@printf '%s\n' 'Targets: install test lint typecheck check render docker-build docker-tag docker-push docker-release docker-test docker-cli-check frontend-install frontend-build frontend-test frontend-e2e frontend-audit release'
	@printf '%s\n' 'Korvus Client lives in its own repository: https://github.com/r4ven-me/korclient'

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
	$(DOCKER) tag $(IMAGE):latest $(GHCR_IMAGE):latest
	$(DOCKER) tag $(IMAGE):latest $(GHCR_IMAGE):v$(VERSION)

docker-push:
	$(DOCKER) push $(REMOTE_IMAGE):latest
	$(DOCKER) push $(REMOTE_IMAGE):v$(VERSION)
	$(DOCKER) push $(GHCR_IMAGE):latest
	$(DOCKER) push $(GHCR_IMAGE):v$(VERSION)

docker-release: docker-build docker-tag docker-push

release: test
	$(GIT) add -A
	$(GIT) commit -m "$(MSG)"
	$(GIT) push
	$(MAKE) docker-release

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
