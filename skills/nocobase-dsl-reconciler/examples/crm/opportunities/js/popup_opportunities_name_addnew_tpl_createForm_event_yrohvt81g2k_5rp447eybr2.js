/**
 * Quotation Total Calculation
 *
 * Auto-calculates quotation totals when form values change.
 * Trigger: Form field change event
 *
 * Auto-fills:
 * - Item fields from product: specification, unit, list_price
 * - Price tier matching: unit_price, discount_rate (from tier), tier_applied, tierInfo, description
 * - exchange_rate from currencyInfo.current_rate
 *
 * Note: discount_rate is stored as decimal (0-1), e.g., 0.10 = 10%
 * Note: unit_price from tier is already the discounted price
 *
 * Calculates:
 * - line_amount: quantity * unit_price (tier price is already discounted)
 * - subtotal: Sum of line_amount
 * - discount_amount: subtotal * header discount_rate
 * - tax_amount: (subtotal - discount_amount + shipping_handling) * tax_rate
 * - total_amount: subtotal - discount_amount + shipping_handling + tax_amount
 * - total_amount_usd: total_amount * exchange_rate
 */

(async () => {
  const values = ctx.form?.values || ctx.form?.getFieldsValue?.() || {};

  // ==================== Config ====================

  const DECIMAL_PLACES = 2;

  // ==================== Helper Functions ====================

  function toNumber(val) {
    const num = parseFloat(val);
    return isNaN(num) ? 0 : num;
  }

  function round(val, decimals = DECIMAL_PLACES) {
    return Math.round(val * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }

  // ==================== Fetch Price Tiers ====================

  const items = values.items || [];
  const currencyId = values.currencyInfo?.id || values.currency_id;

  // Collect unique product IDs
  const productIds = [...new Set(
    items
      .filter(item => item.product?.id)
      .map(item => item.product.id)
  )];

  let priceTiersMap = {}; // { productId: [tiers] }

  if (productIds.length > 0 && ctx.api) {
    try {
      const filter = { product_id: { $in: productIds } };
      if (currencyId) {
        filter.currency_id = currencyId;
      }

      const res = await ctx.api.request({
        url: 'nb_crm_price_tiers:list',
        method: 'GET',
        params: {
          filter,
          sort: ['product_id', 'min_quantity'],
          pageSize: 500,
        },
      });

      const tiers = res?.data?.data || [];

      // Group by product_id
      tiers.forEach(tier => {
        const pid = tier.product_id;
        if (!priceTiersMap[pid]) {
          priceTiersMap[pid] = [];
        }
        priceTiersMap[pid].push(tier);
      });

      console.log('Quotation: Fetched tiers for', productIds.length, 'products,', tiers.length, 'tiers');
    } catch (error) {
      console.error('Failed to fetch price tiers:', error);
    }
  }

  // ==================== Find Matching Tier ====================

  function findMatchingTier(productId, quantity) {
    const tiers = priceTiersMap[productId] || [];
    for (const tier of tiers) {
      const minQty = tier.min_quantity || 0;
      const maxQty = tier.max_quantity || Infinity;
      if (quantity >= minQty && quantity <= maxQty) {
        return tier;
      }
    }
    return null;
  }

  // ==================== Process Items ====================

  let itemsUpdated = false;

  const updatedItems = items.map((item) => {
    const product = item.product;
    let updated = { ...item };

    // Auto-fill from product if available
    if (product) {
      if (product.specification && !item.specification) {
        updated.specification = product.specification;
        itemsUpdated = true;
      }
      if (product.unit && !item.unit) {
        updated.unit = product.unit;
        itemsUpdated = true;
      }
      if (product.list_price && !item.list_price) {
        updated.list_price = toNumber(product.list_price);
        itemsUpdated = true;
      }
    }

    // Default quantity to 1 if not set
    if (!updated.quantity) {
      updated.quantity = 1;
      itemsUpdated = true;
    }

    // Match price tier based on product and quantity
    const quantity = toNumber(updated.quantity);
    const listPrice = toNumber(updated.list_price || product?.list_price);

    if (product?.id && listPrice > 0) {
      const tier = findMatchingTier(product.id, quantity);

      if (tier) {
        const tierPrice = toNumber(tier.unit_price);
        // Use discount_rate from tier directly (stored as decimal: 0.10 = 10%)
        const discountRate = toNumber(tier.discount_rate);
        const discountPercent = round(discountRate * 100, 1);

        // Update tier id
        if (updated.tier_applied !== tier.id) {
          updated.tier_applied = tier.id;
          itemsUpdated = true;
        }

        // Fill tierInfo object (full tier snapshot)
        updated.tierInfo = { ...tier };
        itemsUpdated = true;

        // Update pricing
        if (updated.unit_price !== tierPrice) {
          updated.unit_price = tierPrice;
          itemsUpdated = true;
        }
        // discount_rate is stored as decimal (0-1), e.g., 0.10 = 10%
        if (updated.discount_rate !== discountRate) {
          updated.discount_rate = discountRate;
          itemsUpdated = true;
        }

        // Build detailed tier snapshot description
        const currencySymbol = values.currencyInfo?.symbol || '';
        const currencyCode = values.currencyInfo?.code || '';
        const qtyRange = tier.max_quantity
          ? `${tier.min_quantity} - ${tier.max_quantity}`
          : `${tier.min_quantity}+`;

        const tierSnapshot = [
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          `📋 Price Tier Applied: #${tier.id}`,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          `📌 Tier: ${tier.tier_description || 'Standard Pricing'}`,
          `📦 Quantity Range: ${qtyRange} units`,
          ``,
          `💰 Pricing Details:`,
          `   • Unit Price: ${currencySymbol}${tierPrice.toLocaleString()} ${currencyCode}`,
          `   • Discount: ${discountPercent}%`,
          tier.requires_approval ? `\n⚠️ APPROVAL REQUIRED` : '',
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        ].filter(Boolean).join('\n');

        // Update description if tier changed
        if (updated.tier_applied !== item.tier_applied || !updated.description?.includes('Price Tier Applied')) {
          const existingDesc = (updated.description || '').replace(/━━━━━━━━━━━━[\s\S]*?━━━━━━━━━━━━/g, '').trim();
          updated.description = tierSnapshot + (existingDesc ? '\n\n' + existingDesc : '');
          itemsUpdated = true;
        }
      } else {
        // No tier matched, use list_price
        if (!updated.unit_price) {
          updated.unit_price = listPrice;
          itemsUpdated = true;
        }
        if (updated.discount_rate === undefined || updated.discount_rate === null) {
          updated.discount_rate = 0;
          itemsUpdated = true;
        }
        updated.tierInfo = null;
        updated.tier_applied = null;
      }
    } else {
      // No product or list_price
      if (updated.discount_rate === undefined || updated.discount_rate === null) {
        updated.discount_rate = 0;
        itemsUpdated = true;
      }
    }

    // Calculate line_amount
    // Note: unit_price from tier is already the discounted price, so no need to apply discount again
    const unitPrice = toNumber(updated.unit_price);
    const lineAmount = round(quantity * unitPrice);

    if (updated.line_amount !== lineAmount) {
      updated.line_amount = lineAmount;
      itemsUpdated = true;
    }

    return updated;
  });

  // ==================== Calculate Subtotal ====================

  let subtotal = 0;
  updatedItems.forEach((item) => {
    subtotal += toNumber(item.line_amount);
  });
  subtotal = round(subtotal);

  // ==================== Get Exchange Rate ====================

  // Always sync exchange_rate from currencyInfo when currency is selected
  let exchangeRate = 1;
  if (values.currencyInfo?.current_rate) {
    exchangeRate = toNumber(values.currencyInfo.current_rate);
  } else if (values.exchange_rate) {
    exchangeRate = toNumber(values.exchange_rate);
  }

  // ==================== Calculate Header Amounts ====================

  const headerDiscountRate = toNumber(values.discount_rate);
  const discountAmount = round(subtotal * headerDiscountRate);
  const shippingHandling = toNumber(values.shipping_handling);
  const taxRate = toNumber(values.tax_rate);
  const taxableAmount = subtotal - discountAmount + shippingHandling;
  const taxAmount = round(taxableAmount * taxRate);
  const totalAmount = round(subtotal - discountAmount + shippingHandling + taxAmount);
  const totalAmountUsd = round(totalAmount * exchangeRate, 2);

  // ==================== Update Form ====================

  const updateValues = {
    subtotal,
    discount_amount: discountAmount,
    tax_amount: taxAmount,
    total_amount: totalAmount,
    total_amount_usd: totalAmountUsd,
    exchange_rate: exchangeRate,
  };

  if (itemsUpdated) {
    updateValues.items = updatedItems;
  }

  ctx.form?.setFieldsValue(updateValues);

  // ==================== Debug ====================

  console.log('Quotation Calc:', {
    items: updatedItems.length,
    products: productIds.length,
    tiers: Object.keys(priceTiersMap).length,
    currency: values.currencyInfo?.code || 'N/A',
    currencyRate: values.currencyInfo?.current_rate || 'N/A',
    exchangeRate,
    subtotal,
    totalAmount,
    totalAmountUsd: totalAmountUsd,
  });
})();
