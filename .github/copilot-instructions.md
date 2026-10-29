# Repository guidance

- Use TypeScript strict mode and the Next.js App Router under `src/app`.
- Keep provider secrets server-only; never expose the Supabase service-role key to client code.
- Update `supabase/schema.sql` when changing the persisted document or hybrid-search contract.
- Validate changes with `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
- Keep API route inputs bounded and validate them before processing uploads or model requests.