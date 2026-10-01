// Reproducible, self-hosted Natural Earth basemap. No runtime CDN dependency.
import { readFileSync } from 'node:fs';
import { geoEquirectangular, geoPath, geoGraticule10 } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import sharp from 'sharp';
const world=JSON.parse(readFileSync('node_modules/world-atlas/countries-110m.json','utf8'));
const width=4096,height=2048;
const path=geoPath(geoEquirectangular().scale(width/(2*Math.PI)).translate([width/2,height/2]));
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#101820"/><path d="${path(geoGraticule10())}" fill="none" stroke="#27313a" stroke-width="1.1"/><path d="${path(feature(world,world.objects.land))}" fill="#35434d" stroke="#70808b" stroke-width="1.8"/><path d="${path(mesh(world,world.objects.countries,(a,b)=>a!==b))}" fill="none" stroke="#52616b" stroke-width="0.8"/></svg>`;
await sharp(Buffer.from(svg)).png().toFile('public/maps/alumni-earth.png');
