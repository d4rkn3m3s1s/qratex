import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const results: string[] = [];
  const errors: string[] = [];

  const pathsToDelete = [
    path.join(process.cwd(), 'app', 'customer', 'journey-timeline'),
    path.join(process.cwd(), 'app', 'customer', 'hall-of-fame'),
    path.join(process.cwd(), 'app', 'api', 'customer', 'journey-timeline'),
    path.join(process.cwd(), 'app', 'api', 'customer', 'hall-of-fame'),
    path.join(process.cwd(), 'app', 'admin', 'hall-of-fame'),
    path.join(process.cwd(), 'app', 'admin', 'journey-timeline'),
  ];

  for (const p of pathsToDelete) {
    try {
      if (fs.existsSync(p)) {
        fs.rmSync(p, { recursive: true, force: true });
        results.push(`Deleted: ${p}`);
      } else {
        results.push(`Not found: ${p}`);
      }
    } catch (e: any) {
      errors.push(`Failed to delete ${p}: ${e.message}`);
    }
  }

  return NextResponse.json({ success: true, results, errors });
}
