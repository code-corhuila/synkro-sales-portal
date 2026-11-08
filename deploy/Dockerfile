# The portal alone, as a remote the host loads: build with Node, serve with nginx.
FROM node:22-alpine AS build
WORKDIR /app

# Exactly what the lockfile says, never a newer resolved version.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Where the host (synkro-front) serves the federation entry that exposes
# shell/apiClient and shell/session. Together with its asset base, this is a build input: the portal knows
# the host's entry and nothing else about where it runs.
ARG VITE_BASE_PATH=/
ENV VITE_BASE_PATH=$VITE_BASE_PATH
ARG VITE_SHELL_ENTRY_URL=http://localhost:5173/assets/remoteEntry.js
ENV VITE_SHELL_ENTRY_URL=$VITE_SHELL_ENTRY_URL

# Issuer printed on the sale documents (HU-VEN-19). Explicit configuration with no default: the PDF/XML
# downloads refuse to generate until the legal name and the NIT are provided. Public company data, not a secret.
ARG VITE_ISSUER_LEGAL_NAME=
ENV VITE_ISSUER_LEGAL_NAME=$VITE_ISSUER_LEGAL_NAME
ARG VITE_ISSUER_TAX_ID=
ENV VITE_ISSUER_TAX_ID=$VITE_ISSUER_TAX_ID
ARG VITE_ISSUER_ADDRESS=
ENV VITE_ISSUER_ADDRESS=$VITE_ISSUER_ADDRESS
ARG VITE_ISSUER_PHONE=
ENV VITE_ISSUER_PHONE=$VITE_ISSUER_PHONE
ARG VITE_ISSUER_EMAIL=
ENV VITE_ISSUER_EMAIL=$VITE_ISSUER_EMAIL

RUN npm run build
# Fails the image when the compiled portal has what it must not (see scripts/compiledCheck.mjs).
RUN npm run check:compiled

FROM nginx:1.27-alpine

# The only template variable: the origin of the host that imports this remote.
# Limiting the substitution to it leaves nginx's own $variables untouched.
ENV HOST_ORIGIN=http://localhost:5173
ENV NGINX_ENVSUBST_FILTER=^HOST_ORIGIN$

COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
