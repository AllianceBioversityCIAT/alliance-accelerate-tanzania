# SAM "makefile" build for the backend Lambda (infra/20-backend, T-3).
#
# SAM invokes `build-<LogicalId>` and ships whatever lands in $(ARTIFACTS_DIR).
# The default Node builder uses `npm pack`, which honours .gitignore's `/dist`
# and so drops the compiled `dist/lambda.handler`. This target compiles first,
# then stages dist/ + the prisma schema + production node_modules (incl. the
# rhel-openssl-3.0.x query engine pulled by `binaryTargets`) into the artifact.
#
# Lambda has a 250 MB UNZIPPED package limit. We therefore (a) install prod-only
# deps, (b) copy the Prisma client generated in the SOURCE build instead of
# running `prisma generate` in the artifact — that would re-pull the `prisma`
# CLI + `@prisma/engines` (~120 MB) — and (c) prune the native (darwin) query
# engine and any non-runtime Prisma tooling. Net artifact ~180 MB.

build-ApiFunction:
	npm ci
	npm run prisma:generate
	npm run build
	# Stage runtime artifacts into the SAM build output.
	cp -r dist $(ARTIFACTS_DIR)/dist
	cp -r prisma $(ARTIFACTS_DIR)/prisma
	cp package.json package-lock.json $(ARTIFACTS_DIR)/
	# Production deps only (drops prisma CLI, typescript, jest, etc.).
	cd $(ARTIFACTS_DIR) && npm ci --omit=dev
	# Ship the Prisma client generated in the SOURCE build (incl. engines) — do NOT
	# run `prisma generate` here; it re-installs the prisma CLI + @prisma/engines and
	# blows the 250 MB unzip limit.
	mkdir -p $(ARTIFACTS_DIR)/node_modules/.prisma
	rm -rf $(ARTIFACTS_DIR)/node_modules/.prisma/client
	cp -r node_modules/.prisma/client $(ARTIFACTS_DIR)/node_modules/.prisma/client
	# Lambda only needs the rhel query engine — drop the native (darwin) one.
	find $(ARTIFACTS_DIR)/node_modules/.prisma/client -name 'libquery_engine-darwin*' -delete
	# Safety net: ensure no non-runtime Prisma tooling slipped into the prod install.
	rm -rf $(ARTIFACTS_DIR)/node_modules/prisma $(ARTIFACTS_DIR)/node_modules/@prisma/engines
