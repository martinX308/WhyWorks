// Concrete A4 route takes precedence over the shared A1/A2 catch-all.
export { POST } from '../../../a4/[...path]/route';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
