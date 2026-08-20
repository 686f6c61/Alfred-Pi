---
name: review-api
description: Review an HTTP API (routes/handlers) for design issues - resources, status codes, validation, authz, pagination, error contracts
argument-hint: <args>
origin: original
license: MIT
---

Review the API in $@.

Step 0: detect the runtime (Python FastAPI/Django, C# ASP.NET, Node
Express/Fastify/Nest, or Astro). If the work is the live handler body,
middleware or server auth, switch to the http-service skill. Otherwise
apply api-design: contract table (method, path, authn, authz, request,
success, errors, pagination, evidence), ranked findings, three changes.
Do not copy the http-service handler table.
