.PHONY: install build

install:
	npm install

build:
	npm run build

all: install build
