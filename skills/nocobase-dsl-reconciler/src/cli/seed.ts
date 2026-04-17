/**
 * Auto-generate and insert seed data from collection YAML definitions.
 *
 * Reads collections/*.yaml, determines insert order (parent tables first),
 * generates sample data with correct field types, inserts via API,
 * and captures real IDs for FK relationships.
 *
 * Usage: npx tsx cli/cli.ts seed /tmp/myapp --count 5
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { NocoBaseClient } from '../client';
import { loadYaml } from '../utils/yaml';
import type { FieldDef, CollectionDef } from '../types/spec';

interface SeedOptions {
  count?: number;  // records per table (default: 5)
}

export async function seedData(
  projectDir: string,
  opts: SeedOptions = {},
  log: (msg: string) => void = console.log,
): Promise<void> {
  const nb = await NocoBaseClient.create();
  const root = path.resolve(projectDir);
  const collDir = path.join(root, 'collections');
  if (!fs.existsSync(collDir)) throw new Error(`No collections/ directory in ${root}`);

  const count = opts.count || 5;

  // 1. Load all collections
  const collections = new Map<string, CollectionDef & { name: string }>();
  for (const f of fs.readdirSync(collDir).filter(f => f.endsWith('.yaml')).sort()) {
    const def = loadYaml<Record<string, unknown>>(path.join(collDir, f));
    if (!def?.name) continue;
    collections.set(def.name as string, {
      name: def.name as string,
      title: (def.title || def.name) as string,
      titleField: def.titleField as string,
      fields: (def.fields || []) as FieldDef[],
    });
  }

  // Specialized ERP seed path: richer linked records, totals, and stock states.
  if (
    collections.has('nb_erp_products')
    && collections.has('nb_erp_customer_orders')
    && collections.has('nb_erp_purchase_orders')
  ) {
    await seedErpData(nb, opts.count || 5, log);
    return;
  }

  // 2. Topological sort: parent tables (no m2o deps) first
  const SYSTEM = new Set(['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'createdById', 'updatedById']);
  const deps = new Map<string, Set<string>>(); // collName → set of target collNames
  for (const [name, def] of collections) {
    const targets = new Set<string>();
    for (const f of def.fields) {
      if (SYSTEM.has(f.name)) continue;
      if (f.interface === 'm2o' && f.target && f.target !== name) {
        targets.add(f.target);
      }
    }
    deps.set(name, targets);
  }

  const sorted: string[] = [];
  const visited = new Set<string>();
  function visit(name: string) {
    if (visited.has(name)) return;
    visited.add(name);
    for (const dep of deps.get(name) || []) {
      if (collections.has(dep)) visit(dep);
    }
    sorted.push(name);
  }
  for (const name of collections.keys()) visit(name);

  // 3. Insert data in order, capture real IDs
  const idMap = new Map<string, string[]>(); // collName → [id1, id2, ...]

  for (const collName of sorted) {
    const def = collections.get(collName)!;
    const bizFields = def.fields.filter(f => !SYSTEM.has(f.name) && f.interface !== 'o2m' && f.interface !== 'm2m');
    log(`\n  Seeding ${collName} (${count} records)...`);

    // Collect FK column names used by m2o fields — skip these when filling scalar fields
    // (prevents redundant integer field from overwriting the real FK value)
    const fkColumns = new Set<string>();
    for (const f of bizFields) {
      if (f.interface === 'm2o') {
        fkColumns.add(f.foreignKey || `${f.name}Id`);
      }
    }

    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const record: Record<string, unknown> = {};

      // Fill scalar fields first (skip FK columns that m2o will handle)
      for (const f of bizFields) {
        if (f.interface === 'm2o') continue;
        if (fkColumns.has(f.name)) continue;  // don't overwrite m2o FKs
        record[f.name] = generateSampleValue(f, i, collName);
      }

      // Fill m2o FKs LAST so they win over any stray integer definition
      for (const f of bizFields) {
        if (f.interface !== 'm2o') continue;
        const parentIds = idMap.get(f.target || '');
        if (parentIds?.length) {
          const fkName = f.foreignKey || `${f.name}Id`;
          record[fkName] = parentIds[i % parentIds.length];
        }
      }

      try {
        const resp = await nb.http.post(`${nb.baseUrl}/api/${collName}:create`, record);
        const id = resp.data?.data?.id;
        if (id) {
          ids.push(String(id));
          const name = record.name || record.title || `#${i + 1}`;
          log(`    + ${name} (id=${id})`);
        }
      } catch (e) {
        log(`    ! record ${i + 1}: ${e instanceof Error ? e.message.slice(0, 80) : e}`);
      }
    }
    idMap.set(collName, ids);
  }

  log(`\n  Seed complete: ${sorted.length} collections, ${count} records each.`);
}

function generateSampleValue(f: FieldDef, index: number, collName: string): unknown {
  const i = index + 1;
  const prefix = collName.replace(/^nb_\w+_/, '').replace(/_/g, ' ');

  switch (f.interface) {
    case 'input':
      if (f.name === 'name' || f.name === 'title') return `${capitalize(prefix)} ${i}`;
      if (f.name === 'code') return `${prefix.toUpperCase().replace(/ /g, '-')}-${String(i).padStart(3, '0')}`;
      return `${f.title || f.name} ${i}`;

    case 'textarea':
      return `Sample ${f.title || f.name} for ${prefix} ${i}.`;

    case 'email':
      return `user${i}@example.com`;

    case 'phone':
      return `138${String(10000000 + i * 1111).slice(0, 8)}`;

    case 'url':
      return `https://example.com/${f.name}/${i}`;

    case 'select': {
      const opts = f.options || [];
      if (opts.length) {
        const opt = opts[index % opts.length];
        return typeof opt === 'string' ? opt : opt.value;
      }
      return null;
    }

    case 'multipleSelect': {
      const opts = f.options || [];
      if (opts.length) {
        const opt = opts[index % opts.length];
        return [typeof opt === 'string' ? opt : opt.value];
      }
      return [];
    }

    case 'integer':
      return i * 10;

    case 'number':
    case 'percent':
      return Math.round((i * 17.5 + 10) * 100) / 100;

    case 'checkbox':
      return i % 2 === 0;

    case 'dateOnly': {
      const d = new Date();
      d.setDate(d.getDate() + (i - 1) * 7);
      return d.toISOString().split('T')[0];
    }

    case 'datetime': {
      const d = new Date();
      d.setDate(d.getDate() + (i - 1) * 7);
      return d.toISOString();
    }

    default:
      return null;
  }
}

function capitalize(s: string): string {
  return s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

interface CreatedRow extends Record<string, unknown> {
  id: string;
}

async function seedErpData(
  nb: NocoBaseClient,
  count: number,
  log: (msg: string) => void,
): Promise<void> {
  const supplierNames = [
    'Northwind Components',
    'Blue Harbor Supply',
    'Summit Industrial',
    'Golden Axis Trading',
    'Atlas Packaging',
    'Everfield Distribution',
    'Granite Peak Goods',
    'Metro Wholesale',
  ];
  const customerNames = [
    'Acme Retail Group',
    'BrightMart Stores',
    'Crescent Home',
    'Delta Pro Services',
    'Elm Street Pharmacy',
    'Fresh Basket Market',
    'Greenline Outfitters',
    'Harbor Kitchen Co',
    'Ion Fitness Studio',
    'Jade Office Supply',
  ];
  const productCatalog = [
    { sku: 'ERP-1001', name: 'Industrial Gloves', category: 'Safety', unit: 'box', cost: 18, price: 29, reorder: 20, stock: 64 },
    { sku: 'ERP-1002', name: 'Packing Tape', category: 'Packaging', unit: 'box', cost: 12, price: 19, reorder: 18, stock: 42 },
    { sku: 'ERP-1003', name: 'LED Work Lamp', category: 'Electrical', unit: 'each', cost: 34, price: 59, reorder: 10, stock: 15 },
    { sku: 'ERP-1004', name: 'Bulk Storage Bin', category: 'Storage', unit: 'each', cost: 24, price: 41, reorder: 12, stock: 8 },
    { sku: 'ERP-1005', name: 'Cleaning Solvent', category: 'Maintenance', unit: 'liter', cost: 9, price: 16, reorder: 25, stock: 54 },
    { sku: 'ERP-1006', name: 'Safety Helmet', category: 'Safety', unit: 'each', cost: 21, price: 36, reorder: 16, stock: 11 },
    { sku: 'ERP-1007', name: 'Corrugated Box Pack', category: 'Packaging', unit: 'box', cost: 15, price: 24, reorder: 20, stock: 5 },
    { sku: 'ERP-1008', name: 'Tool Organizer', category: 'Storage', unit: 'each', cost: 28, price: 45, reorder: 8, stock: 0 },
    { sku: 'ERP-1009', name: 'Power Adapter', category: 'Electrical', unit: 'each', cost: 17, price: 31, reorder: 14, stock: 23 },
    { sku: 'ERP-1010', name: 'Machine Lubricant', category: 'Maintenance', unit: 'liter', cost: 13, price: 22, reorder: 18, stock: 39 },
    { sku: 'ERP-1011', name: 'Warehouse Label Roll', category: 'Packaging', unit: 'box', cost: 10, price: 18, reorder: 12, stock: 9 },
    { sku: 'ERP-1012', name: 'Extension Cable', category: 'Electrical', unit: 'each', cost: 14, price: 26, reorder: 14, stock: 27 },
  ];

  const supplierCount = Math.max(4, Math.min(supplierNames.length, count + 1));
  const customerCount = Math.max(6, Math.min(customerNames.length, count * 2));
  const productCount = Math.max(8, Math.min(productCatalog.length, count * 2 + 2));
  const orderCount = Math.max(8, count * 2);
  const purchaseOrderCount = Math.max(5, count + 2);

  log('\n  Seeding ERP demo data...');

  const suppliers: CreatedRow[] = [];
  for (let i = 0; i < supplierCount; i++) {
    suppliers.push(await createRecord(nb, 'nb_erp_suppliers', {
      supplier_code: `SUP-${String(i + 1).padStart(3, '0')}`,
      name: supplierNames[i],
      contact_name: `Account Manager ${i + 1}`,
      email: `suppliers${i + 1}@example.com`,
      phone: `138${String(20000000 + i * 1777).slice(0, 8)}`,
      status: i % 3 === 0 ? 'preferred' : 'active',
      payment_terms: ['net_15', 'net_30', 'prepaid'][i % 3],
      lead_time_days: 5 + i * 2,
      address: `${18 + i} Supply Park, Shanghai`,
      notes: `Primary supplier lane ${i + 1}.`,
    }, log));
  }

  const customers: CreatedRow[] = [];
  for (let i = 0; i < customerCount; i++) {
    customers.push(await createRecord(nb, 'nb_erp_customers', {
      customer_code: `CUS-${String(i + 1).padStart(3, '0')}`,
      name: customerNames[i],
      email: `buyers${i + 1}@example.com`,
      phone: `139${String(30000000 + i * 1999).slice(0, 8)}`,
      segment: ['wholesale', 'retail', 'distributor', 'online'][i % 4],
      status: i % 5 === 0 ? 'on_hold' : 'active',
      credit_limit: 15000 + i * 4500,
      billing_address: `${88 + i} Finance Street, Hangzhou`,
      shipping_address: `${188 + i} Delivery Avenue, Suzhou`,
      notes: `Priority account tier ${1 + (i % 3)}.`,
    }, log));
  }

  const products: CreatedRow[] = [];
  for (let i = 0; i < productCount; i++) {
    const p = productCatalog[i];
    const inventoryStatus = p.stock === 0 ? 'out_of_stock' : (p.stock <= p.reorder ? 'low_stock' : 'healthy');
    products.push(await createRecord(nb, 'nb_erp_products', {
      sku: p.sku,
      name: p.name,
      category: p.category,
      unit: p.unit,
      status: i === 10 ? 'inactive' : 'active',
      inventory_status: inventoryStatus,
      current_stock: p.stock,
      reorder_point: p.reorder,
      safety_stock: Math.max(4, Math.floor(p.reorder * 0.6)),
      standard_cost: p.cost,
      sale_price: p.price,
      last_restock_date: dateDaysAgo(4 + i * 3),
      preferred_supplierId: suppliers[i % suppliers.length].id,
      description: `${p.name} for warehouse and retail operations.`,
    }, log));
  }

  const purchaseOrders: CreatedRow[] = [];
  const purchaseStatuses = ['draft', 'submitted', 'approved', 'received'];
  for (let i = 0; i < purchaseOrderCount; i++) {
    purchaseOrders.push(await createRecord(nb, 'nb_erp_purchase_orders', {
      po_number: `PO-2026-${String(i + 1).padStart(3, '0')}`,
      supplierId: suppliers[i % suppliers.length].id,
      status: purchaseStatuses[i % purchaseStatuses.length],
      order_date: dateDaysAgo(55 - i * 4),
      expected_date: dateDaysAgo(35 - i * 3),
      total_amount: 0,
      buyer_name: `Buyer ${1 + (i % 3)}`,
      notes: `Restock cycle ${i + 1}.`,
    }, log));
  }

  let purchaseLineIndex = 1;
  for (let i = 0; i < purchaseOrders.length; i++) {
    const po = purchaseOrders[i];
    let total = 0;
    const lineCount = 2 + (i % 3);
    for (let j = 0; j < lineCount; j++) {
      const product = products[(i * 2 + j) % products.length];
      const quantity = 20 + i * 4 + j * 3;
      const unitCost = Number(product.standard_cost) || 0;
      const lineTotal = round2(quantity * unitCost);
      total += lineTotal;
      await createRecord(nb, 'nb_erp_purchase_order_lines', {
        line_label: `${po.po_number} / Line ${purchaseLineIndex}`,
        purchaseOrderId: po.id,
        productId: product.id,
        quantity,
        unit_cost: unitCost,
        received_quantity: po.status === 'received' ? quantity : Math.floor(quantity * 0.45),
        line_total: lineTotal,
        line_status: po.status === 'received' ? 'received' : (po.status === 'approved' ? 'partial' : 'open'),
        notes: `Inbound supply for ${product.name}.`,
      }, log);
      purchaseLineIndex++;
    }
    await updateRecord(nb, 'nb_erp_purchase_orders', po.id, { total_amount: round2(total) });
  }

  const orders: CreatedRow[] = [];
  const orderStatuses = ['draft', 'confirmed', 'picking', 'shipped', 'completed', 'cancelled'];
  const paymentStatuses = ['unpaid', 'partial', 'paid', 'paid', 'paid', 'refunded'];
  for (let i = 0; i < orderCount; i++) {
    orders.push(await createRecord(nb, 'nb_erp_customer_orders', {
      order_number: `SO-2026-${String(i + 1).padStart(3, '0')}`,
      customerId: customers[i % customers.length].id,
      status: orderStatuses[i % orderStatuses.length],
      payment_status: paymentStatuses[i % paymentStatuses.length],
      order_date: dateDaysAgo(75 - i * 5),
      required_date: dateDaysAgo(62 - i * 4),
      total_amount: 0,
      shipping_address: customers[i % customers.length].shipping_address,
      notes: `Customer order batch ${i + 1}.`,
    }, log));
  }

  let lineIndex = 1;
  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    let total = 0;
    const lineCount = 2 + (i % 3);
    for (let j = 0; j < lineCount; j++) {
      const product = products[(i + j * 3) % products.length];
      const quantity = 2 + ((i + j) % 5);
      const unitPrice = Number(product.sale_price) || 0;
      const discount = (i + j) % 4 === 0 ? round2(unitPrice * quantity * 0.05) : 0;
      const lineTotal = round2(quantity * unitPrice - discount);
      total += lineTotal;
      await createRecord(nb, 'nb_erp_order_lines', {
        line_label: `${order.order_number} / Line ${lineIndex}`,
        orderId: order.id,
        productId: product.id,
        quantity,
        unit_price: unitPrice,
        discount_amount: discount,
        line_total: lineTotal,
        fulfill_status: order.status === 'completed' || order.status === 'shipped'
          ? 'shipped'
          : (order.status === 'picking' ? 'allocated' : 'pending'),
        notes: `Sell-through line for ${product.name}.`,
      }, log);
      lineIndex++;
    }
    await updateRecord(nb, 'nb_erp_customer_orders', order.id, { total_amount: round2(total) });
  }

  let movementIndex = 1;
  for (let i = 0; i < purchaseOrders.length; i++) {
    const po = purchaseOrders[i];
    const product = products[i % products.length];
    await createRecord(nb, 'nb_erp_inventory_movements', {
      reference_number: `GRN-${String(movementIndex).padStart(3, '0')}`,
      productId: product.id,
      movement_type: 'receipt',
      quantity: 18 + i * 4,
      unit_cost: product.standard_cost,
      related_purchase_orderId: po.id,
      movement_date: dateDaysAgo(30 - i * 2),
      notes: `Receipt posted for ${po.po_number}.`,
    }, log);
    movementIndex++;
  }

  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    if (!['shipped', 'completed'].includes(String(order.status || ''))) continue;
    const product = products[(i * 2) % products.length];
    await createRecord(nb, 'nb_erp_inventory_movements', {
      reference_number: `ISS-${String(movementIndex).padStart(3, '0')}`,
      productId: product.id,
      movement_type: 'issue',
      quantity: 3 + (i % 4),
      unit_cost: product.standard_cost,
      related_orderId: order.id,
      movement_date: dateDaysAgo(14 - (i % 6)),
      notes: `Shipment issue for ${order.order_number}.`,
    }, log);
    movementIndex++;
  }

  log(`\n  ERP seed complete: ${suppliers.length} suppliers, ${customers.length} customers, ${products.length} products, ${orders.length} orders.`);
}

async function createRecord(
  nb: NocoBaseClient,
  collName: string,
  record: Record<string, unknown>,
  log: (msg: string) => void,
): Promise<CreatedRow> {
  const resp = await nb.http.post(`${nb.baseUrl}/api/${collName}:create`, record);
  const data = resp.data?.data || {};
  const id = String(data.id || '');
  const title = String(record.name || record.line_label || record.order_number || record.po_number || record.reference_number || id);
  log(`    + ${collName}: ${title}`);
  return { ...record, ...data, id };
}

async function updateRecord(
  nb: NocoBaseClient,
  collName: string,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await nb.http.post(`${nb.baseUrl}/api/${collName}:update`, patch, { params: { filterByTk: id } });
}

function dateDaysAgo(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
