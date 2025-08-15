import { NextResponse } from 'next/server';
export async function GET() {
  // Replace with real GeoJSON from DB
  return NextResponse.json({
    type: 'FeatureCollection',
    features: []
  });
}
