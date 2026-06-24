# SAM "makefile" build for the backend Lambda (infra/20-backend, T-3).
#
# SAM invokes `build-<LogicalId>` and ships whatever lands in $(ARTIFACTS_DIR).
# The default Node builder uses `npm pack`, which honours .gitignore's `/dist`
# and so drops the compiled `dist/lambda.handler`. This target compiles first,
# then stages dist/ + the prisma schema + production node_modules (incl. the
# rhel-openssl-3.0.x query engine pulled by `binaryTargets`) into the artifact.

build-ApiFunction:
	npm ci
	npm run prisma:generate
	npm run build
	# Stage runtime artifacts into the SAM build output.
	cp -r dist $(ARTIFACTS_DIR)/dist
	cp -r prisma $(ARTIFACTS_DIR)/prisma
	cp package.json package-lock.json $(ARTIFACTS_DIR)/
	# Production deps only (smaller package; @prisma/client + serverless-http etc.).
	cd $(ARTIFACTS_DIR) && npm ci --omit=dev
	# Regenerate the Prisma client (incl. rhel engine) against the pruned modules.
	cd $(ARTIFACTS_DIR) && npx prisma generate
