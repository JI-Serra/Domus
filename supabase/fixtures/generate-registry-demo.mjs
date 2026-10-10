import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Deterministic fictional HR-02 import fixture; scale with --units 2000 for performance exercises. */
const flag = process.argv.indexOf('--units');
const units = flag < 0 ? 150 : Number(process.argv[flag + 1]);
if (!Number.isInteger(units) || units < 1 || units > 2000)
  throw new Error('Invalid unit count');
const header = [
  'unit_code',
  'unit_block_code',
  'unit_lot_number',
  'unit_status',
  'unit_coefficient',
  'person_first_name',
  'person_last_name',
  'person_document_type',
  'person_document_number',
  'person_email',
  'unit_resident_relationship',
  'unit_resident_is_holder',
  'unit_resident_is_minor',
];
const lines = [header.join(',')];
for (let unit = 1; unit <= units; unit++) {
  const block = Math.floor((unit - 1) / 10) + 1;
  const lot = ((unit - 1) % 10) + 1;
  for (let resident = 0; resident < 3; resident++) {
    lines.push(
      [
        `Demo Mz ${block} Lote ${lot}`,
        block,
        lot,
        'occupied',
        1,
        ['Mariana', 'Pablo', 'Sofia'][resident],
        `Familia${unit}`,
        'dni',
        80000000 + unit * 3 + resident,
        resident === 2 ? '' : `demo.${unit}.${resident}@domus.local`,
        resident === 0 ? 'owner' : 'family',
        resident === 0,
        resident === 2,
      ].join(','),
    );
  }
}
const destination = new URL(`./registry-demo-${units}.csv`, import.meta.url);
writeFileSync(destination, `${lines.join('\n')}\n`);
process.stdout.write(
  `Generated ${units} units / ${units * 3} residents: ${fileURLToPath(destination)}\n`,
);
