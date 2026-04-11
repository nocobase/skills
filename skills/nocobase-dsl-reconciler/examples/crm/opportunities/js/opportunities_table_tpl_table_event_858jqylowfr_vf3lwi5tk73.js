
  // Sanitize filter: $dateBetween string → array for flowSql compatibility
  var _sanitizeFilter = function(f) {
    if (!f || typeof f !== 'object') return f;
    if (Array.isArray(f)) return f.map(function(item) { return _sanitizeFilter(item); });
    var result = {};
    for (var k in f) {
      if (k === '$dateBetween' && typeof f[k] === 'string') {
        // "2026-02" → ["2026-02-01", "2026-02-28"]
        var v = f[k];
        if (/^\d{4}-\d{2}$/.test(v)) {
          var parts = v.split('-');
          var lastDay = new Date(Number(parts[0]), Number(parts[1]), 0).getDate();
          result[k] = [v + '-01', v + '-' + String(lastDay).padStart(2, '0')];
        } else {
          result[k] = v;
        }
      } else {
        result[k] = _sanitizeFilter(f[k]);
      }
    }
    return result;
  };


const { Table, Tag, Space, Typography, Tooltip } = ctx.libs.antd;
const _ = ctx.libs.lodash;
const { useState, useEffect, useCallback, useRef } = ctx.libs.React;

const fmtNum = (v) => {
  const n = Number(v || 0);
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
};

const STAGE_COLORS = {
  'Initial Contact': 'default', 'Needs Analysis': 'blue', 'Solution Development': 'cyan',
  'Proposal & Negotiation': 'orange', 'Contract Review': 'gold', 'Win': 'green', 'Lose': 'red',
};

const calc = (rows) => {
  const n = rows.length;
  const withAmt = rows.filter(r => r.amount != null && Number(r.amount) > 0);
  return {
    n,
    totalAmount: _.sumBy(rows, r => Number(r.amount) || 0),
    avgAmount: withAmt.length > 0 ? _.meanBy(withAmt, r => Number(r.amount) || 0) : 0,
    avgProb: rows.length > 0 ? _.meanBy(rows, r => Number(r.win_probability) || 0) : 0,
    weighted: _.sumBy(rows, r => (Number(r.amount) || 0) * (Number(r.win_probability) || 0)),
  };
};

const Summary = () => {
  const [allData, setAllData] = useState([]);
  const [selectedRows, setSelectedRows] = useState([]);
  const patchedRef = useRef(false);

  const fetchAll = useCallback(async () => {
    try {
      const filter = _sanitizeFilter(ctx.resource.getFilter());
      if (ctx.flowSettingsEnabled) {
        ctx.sql.save({ uid: 'summary_opportunities', sql: `SELECT "id","amount","win_probability","stage","lead_source" FROM "nb_crm_opportunities"`, dataSourceKey: 'main' }).catch(function(){});
      }
      const items = await ctx.sql.runById('summary_opportunities', { filter, type: 'selectRows', dataSourceKey: 'main' });
      setAllData(items || []);
    } catch (e) { console.error('Opportunity summary fetch failed', e); }
  }, []);

  useEffect(() => {
    fetchAll();
    ctx.resource.on('refresh', fetchAll);
    setSelectedRows(ctx.resource?.getSelectedRows?.() || []);
    if (!patchedRef.current && ctx.resource?.setSelectedRows) {
      const orig = ctx.resource.setSelectedRows.bind(ctx.resource);
      ctx.resource.setSelectedRows = (rows) => { const r = orig(rows); setSelectedRows([...rows]); return r; };
      patchedRef.current = true;
    }
    return () => ctx.resource.off('refresh', fetchAll);
  }, []);

  const sel = calc(selectedRows);
  const all = calc(allData);

  const renderRow = (label, s, bg, color) => (
    <Table.Summary.Row style={{ background: bg }}>
      <Table.Summary.Cell index={0} />
      <Table.Summary.Cell index={1}>
        <Tooltip title={`Total ${fmtNum(s.totalAmount)}, Avg ${fmtNum(s.avgAmount)}, Weighted ${fmtNum(s.weighted)}`}>
          <Typography.Text strong style={{ fontSize: 12 }}>{fmtNum(s.totalAmount)}</Typography.Text>
        </Tooltip>
      </Table.Summary.Cell>
      <Table.Summary.Cell index={2}>
        <Typography.Text strong style={{ color, whiteSpace: 'nowrap' }}>
          {label} <Tag color={color === '#1890ff' ? 'blue' : 'default'} style={{ marginLeft: 4, fontSize: 11 }}>{s.n}</Tag>
        </Typography.Text>
      </Table.Summary.Cell>
      <Table.Summary.Cell index={3} />
      <Table.Summary.Cell index={4} />
      <Table.Summary.Cell index={5}>
        <Typography.Text style={{ fontSize: 12 }}>{(s.avgProb * 100).toFixed(0)}%</Typography.Text>
      </Table.Summary.Cell>
      <Table.Summary.Cell index={6} />
      <Table.Summary.Cell index={7} />
      <Table.Summary.Cell index={8} />
      <Table.Summary.Cell index={9} />
    </Table.Summary.Row>
  );

  return (
    <Table.Summary fixed>
      {renderRow(sel.n > 0 ? 'Selected' : 'None selected', sel, sel.n > 0 ? '#e6f7ff' : '#fafafa', '#1890ff')}
      {renderRow('All', all, '#fafafa', '#333')}
      <Table.Summary.Row style={{ background: '#fafafa' }}>
        <Table.Summary.Cell index={1} colSpan={10}>
          <Space size={4} wrap>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>Stage:</Typography.Text>
            {Object.entries(_.countBy(allData, r => r.stage || 'N/A'))
              .sort(([,a],[,b]) => b - a)
              .map(([stage, count]) => {
                const stageAmt = _.sumBy(allData.filter(r => r.stage === stage), r => Number(r.amount) || 0);
                return (
                  <Tooltip key={stage} title={`${stage}: ${count} opps, ${fmtNum(stageAmt)}`}>
                    <Tag color={STAGE_COLORS[stage] || 'default'} style={{ margin: 0, fontSize: 11 }}>
                      {stage}: {count}
                    </Tag>
                  </Tooltip>
                );
              })}
          </Space>
        </Table.Summary.Cell>
      </Table.Summary.Row>
    </Table.Summary>
  );
};

ctx.model.props.summary = () => <Summary />;
