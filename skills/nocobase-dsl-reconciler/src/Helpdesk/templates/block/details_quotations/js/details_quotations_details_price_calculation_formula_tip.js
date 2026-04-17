/**
 * Price Calculation Formula Tip
 *
 * Displays help tip for quotation price calculation formulas
 */

const { Typography } = ctx.antd;
const { Text } = Typography;

const TipCard = () => {
  const tipStyle = {
    border: '1px solid #86efac',
    borderRadius: 8,
    padding: '12px 16px',
    fontSize: 13,
  };

  const titleStyle = {
    fontSize: 14,
    fontWeight: 600,
    color: '#15803d',
    marginBottom: 10,
    display: 'block',
  };

  const formulaRowStyle = {
    display: 'flex',
    alignItems: 'center',
    marginBottom: 4,
    color: '#475569',
  };

  const fieldStyle = {
    color: '#16a34a',
    fontWeight: 500,
    minWidth: 120,
    display: 'inline-block',
  };

  const operatorStyle = {
    color: '#64748b',
    margin: '0 6px',
  };

  const footerStyle = {
    marginTop: 10,
    paddingTop: 8,
    borderTop: '1px dashed #86efac',
    fontSize: 12,
    color: '#15803d',
  };

  return (
    <div style={tipStyle}>
      <Text style={titleStyle}>🔎 Price Calculation Formula</Text>

      <div style={formulaRowStyle}>
        <Text style={fieldStyle}>Line Amount</Text>
        <Text style={operatorStyle}>=</Text>
        <Text>Quantity × Unit Price</Text>
      </div>

      <div style={formulaRowStyle}>
        <Text style={fieldStyle}>Subtotal</Text>
        <Text style={operatorStyle}>=</Text>
        <Text>Sum of all Line Amounts</Text>
      </div>

      <div style={formulaRowStyle}>
        <Text style={fieldStyle}>Discount Amount</Text>
        <Text style={operatorStyle}>=</Text>
        <Text>Subtotal × Discount Rate</Text>
      </div>

      <div style={formulaRowStyle}>
        <Text style={fieldStyle}>Tax Amount</Text>
        <Text style={operatorStyle}>=</Text>
        <Text>(Subtotal - Discount + S&H) × Tax Rate</Text>
      </div>

      <div style={formulaRowStyle}>
        <Text style={fieldStyle}>Total Amount</Text>
        <Text style={operatorStyle}>=</Text>
        <Text>Subtotal - Discount + S&H + Tax</Text>
      </div>

      <div style={formulaRowStyle}>
        <Text style={fieldStyle}>Total (USD)</Text>
        <Text style={operatorStyle}>=</Text>
        <Text>Total Amount × Exchange Rate</Text>
      </div>

      <div style={footerStyle}>
        💡 Exchange Rate auto-fills from selected Currency
      </div>
    </div>
  );
};

ctx.render(<TipCard />);
