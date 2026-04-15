
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

const STATUS_COLORS = {
  Draft: 'default', Submitted: 'blue', 'Under Review': 'cyan',
  Approved: 'green', Rejected: 'red', Expired: 'orange', Accepted: 'green', Sent: 'blue',
};

const calc = (rows) => ({
  n: rows.length,
  totalAmount: _.sumBy(rows, r => Number(r.total_amount) || 0),
  totalUsd: _.sumBy(rows, r => Number(r.total_amount_usd) || 0),
  avgDiscount: rows.length > 0 ? _.meanBy(rows, r => Number(r.discount_rate) || 0) : 0,
});

const Summary = () => {
  const [allData, setAllData] = useState([]);
  const [selectedRows, setSelectedRows] = useState([]);
  const patchedRef = useRef(false);

  const fetchAll = useCallback(async () => {
    try {
      const filter = _sanitizeFilter(ctx.resource.getFilter());
      if (ctx.flowSettingsEnabled) {
        ctx.sql.save({ uid: 'summary_quotations', sql: `SELECT "id","total_amount","total_amount_usd","discount_rate","status" FROM "nb_crm_quotations"`, dataSourceKey: 'main' }).catch(function(){});
      }
      const items = await ctx.sql.runById('summary_quotations', { filter, type: 'selectRows', dataSourceKey: 'main' });
      setAllData(items || []);
    } catch (e) { console.error('Quotation summary fetch failed', e); }
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
        <Typography.Text strong style={{ color, whiteSpace: 'nowrap' }}>
          {label} <Tag color={color === '#1890ff' ? 'blue' : 'default'} style={{ marginLeft: 4, fontSize: 11 }}>{s.n}</Tag>
        </Typography.Text>
      </Table.Summary.Cell>
      <Table.Summary.Cell index={2}>
        <Typography.Text style={{ fontSize: 12 }}>{(s.avgDiscount * 100).toFixed(1)}%</Typography.Text>
      </Table.Summary.Cell>
      <Table.Summary.Cell index={3} />
      <Table.Summary.Cell index={4}>
        <Typography.Text style={{ fontSize: 12 }}>{fmtNum(s.totalUsd)}</Typography.Text>
      </Table.Summary.Cell>
      <Table.Summary.Cell index={5}>
        <Tooltip title={`Total ${fmtNum(s.totalAmount)}`}>
          <Typography.Text strong style={{ fontSize: 12 }}>{fmtNum(s.totalAmount)}</Typography.Text>
        </Tooltip>
      </Table.Summary.Cell>
      <Table.Summary.Cell index={6} />
      <Table.Summary.Cell index={7} />
      <Table.Summary.Cell index={8} />
    </Table.Summary.Row>
  );

  return (
    <Table.Summary fixed>
      {renderRow(sel.n > 0 ? 'Selected' : 'None selected', sel, sel.n > 0 ? '#e6f7ff' : '#fafafa', '#1890ff')}
      {renderRow('All', all, '#fafafa', '#333')}
      <Table.Summary.Row style={{ background: '#fafafa' }}>
        <Table.Summary.Cell index={1} colSpan={9}>
          <Space size={4} wrap>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>Status:</Typography.Text>
            {Object.entries(_.countBy(allData, r => r.status || 'N/A'))
              .sort(([,a],[,b]) => b - a)
              .map(([st, count]) => {
                const stAmt = _.sumBy(allData.filter(r => r.status === st), r => Number(r.total_amount) || 0);
                return (
                  <Tooltip key={st} title={`${st}: ${count} quotes, ${fmtNum(stAmt)}`}>
                    <Tag color={STATUS_COLORS[st] || 'default'} style={{ margin: 0, fontSize: 11 }}>{st}: {count}</Tag>
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
