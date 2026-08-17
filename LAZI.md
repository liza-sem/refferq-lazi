# LAZI fork

Upstream: [Refferq](https://github.com/Refferq/Refferq).

Changes for lazi.studio:

- Transactional email goes through Plunk (`src/lib/plunk.ts`), not Resend
- Docker entrypoint runs `prisma db push` and can create the first admin
- Live URL: https://partners.lazi.studio

Secrets live in Dokploy env vars, not in this repo.
