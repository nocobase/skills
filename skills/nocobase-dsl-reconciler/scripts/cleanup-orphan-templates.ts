/**
 * Delete orphan flowModelTemplates (not referenced by any live field/block).
 *
 * A template is a "live reference" if it's referenced by:
 *   1. Any field's popupSettings.openView.popupTemplateUid
 *   2. Any block's referenceSettings.useTemplate.templateUid (ReferenceBlockModel)
 *
 * Usage: npx tsx scripts/cleanup-orphan-templates.ts [--dry-run]
 */
import { NocoBaseClient } from '../src/client';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const nb = await NocoBaseClient.create();

  console.log('Fetching all templates...');
  const tplResp = await nb.http.get(`${nb.baseUrl}/api/flowModelTemplates:list`, { params: { paginate: false } });
  const templates = tplResp.data?.data || [];
  console.log(`Found ${templates.length} templates\n`);

  // Find referenced template UIDs by scanning all flowModels
  console.log('Scanning all flowModels for template references...');
  const referenced = new Set<string>();

  // Query all flowModels — get those with popupTemplateUid or templateUid in stepParams
  // NocoBase doesn't support deep JSON filter, so fetch all and filter in code
  let page = 1;
  const pageSize = 200;
  let totalScanned = 0;
  while (true) {
    const resp = await nb.http.get(`${nb.baseUrl}/api/flowModels:list`, {
      params: { page, pageSize },
    });
    const items = resp.data?.data || [];
    if (!items.length) break;
    for (const m of items) {
      const sp = m.stepParams || {};
      // Popup template ref on fields
      const popupTplUid = sp.popupSettings?.openView?.popupTemplateUid;
      if (popupTplUid) referenced.add(popupTplUid);
      // Reference block template
      const refTplUid = sp.referenceSettings?.useTemplate?.templateUid;
      if (refTplUid) referenced.add(refTplUid);
    }
    totalScanned += items.length;
    if (items.length < pageSize) break;
    page++;
    if (page % 10 === 0) console.log(`  scanned ${totalScanned} models...`);
  }
  console.log(`Scanned ${totalScanned} flowModels, found ${referenced.size} referenced templates\n`);

  // Also mark current route/tab templates as live (in case they're templates themselves)
  const routesResp = await nb.http.get(`${nb.baseUrl}/api/desktopRoutes:list`, { params: { tree: true, paginate: false } });
  const routeUids = new Set<string>();
  function walkRoute(node: any) {
    if (node.schemaUid) routeUids.add(node.schemaUid);
    for (const c of (node.children || [])) walkRoute(c);
  }
  for (const r of (routesResp.data?.data || [])) walkRoute(r);

  // Orphans: templates with UID not in referenced set
  const orphans = templates.filter((t: any) => !referenced.has(t.uid));
  const live = templates.length - orphans.length;
  console.log(`Live templates: ${live}`);
  console.log(`Orphan templates: ${orphans.length}`);

  if (dryRun) {
    console.log('\n--dry-run — sample of orphans:');
    for (const t of orphans.slice(0, 20)) {
      console.log(`  ${t.uid.slice(0, 10)} ${t.type} ${t.name} (${t.collectionName || 'no coll'})`);
    }
    if (orphans.length > 20) console.log(`  ... and ${orphans.length - 20} more`);
    return;
  }

  if (!orphans.length) {
    console.log('No orphans to delete.');
    return;
  }

  console.log(`\nDeleting ${orphans.length} orphan templates + their targets...`);
  let deleted = 0, failed = 0;
  for (const t of orphans) {
    try {
      await nb.http.post(`${nb.baseUrl}/api/flowModelTemplates:destroy`, {}, { params: { filterByTk: t.uid } });
      // Also destroy the targetUid (detached template target model)
      if (t.targetUid) {
        try {
          await nb.http.post(`${nb.baseUrl}/api/flowModels:destroy`, {}, { params: { filterByTk: t.targetUid } });
        } catch { /* target may already be gone */ }
      }
      deleted++;
      if (deleted % 50 === 0) console.log(`  deleted ${deleted}/${orphans.length}...`);
    } catch (e: any) {
      failed++;
      if (failed < 5) console.log(`  ! ${t.uid.slice(0, 10)}: ${e.message?.slice(0, 60)}`);
    }
  }
  console.log(`\nDone. Deleted ${deleted}, failed ${failed}.`);
}

main().catch(e => { console.error(e); process.exit(1); });
