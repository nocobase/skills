/**
 * Category Tree Filter - Product Category Sidebar
 *
 * Tree filter to filter product list by category hierarchy.
 *
 * Features:
 * - Expandable/collapsible tree structure
 * - Shows product count per category (including children)
 * - Click to filter product list by category
 * - Search categories by name
 * - "All Products" option to clear filter
 *
 * Tables: nb_crm_product_categories, nb_crm_products
 */

// ==================== Config ====================
const TARGET_BLOCK_UID = '1rhp2sd8tbn';  // TODO: Replace with actual product list block UID
const TABLE_NAME = 'nb_crm_product_categories';
const PRODUCT_TABLE = 'nb_crm_products';

// ==================== Setup ====================
const { useState, useEffect, useMemo, useCallback } = ctx.React;
const { Card, Spin, Tree, Input, Badge, Typography, Space } = ctx.antd;
const { Search } = Input;
const { Text } = Typography;

// Theme detection
const algorithm = ctx.antdConfig?.theme?.algorithm;
const darkAlgo = ctx.antd.theme.darkAlgorithm;
const isDark = Array.isArray(algorithm)
  ? algorithm.some(fn => fn === darkAlgo)
  : algorithm === darkAlgo;
const T = ctx.themeToken || {};

// i18n
const t = (key, opts) => ctx.t(key, { ns: 'nb_crm', ...opts });

// ==================== Styles ====================
const styles = {
  card: {
    borderRadius: 12,
  },
  cardBody: {
    padding: 0,
  },
  searchBox: {
    padding: '12px 16px 8px',
  },
  treeContainer: {
    padding: '0 8px 12px',
    maxHeight: 400,
    overflowY: 'auto',
  },
  loadingContainer: {
    display: 'flex',
    justifyContent: 'center',
    padding: 40,
  },
  nodeTitle: {
    width: '100%',
    justifyContent: 'space-between',
  },
};

// ==================== Hooks ====================
function useCategoryData() {
  const [categories, setCategories] = useState([]);
  const [productCounts, setProductCounts] = useState({});
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch categories with tree structure
        const categoryRes = await ctx.api.request({
          url: `${TABLE_NAME}:list`,
          params: { tree: true, pageSize: 500, sort: ['sort_order'] },
        });
        const categoryData = categoryRes?.data?.data || [];

        // Fetch total product count
        const productRes = await ctx.api.request({
          url: `${PRODUCT_TABLE}:list`,
          params: { pageSize: 1, appends: ['category'] },
        });
        const total = productRes?.data?.meta?.count || 0;
        setTotalCount(total);

        // Get counts per category
        const countRes = await ctx.api.request({
          url: `${PRODUCT_TABLE}:list`,
          params: { pageSize: 9999, fields: ['id', 'category_id'] },
        });
        const products = countRes?.data?.data || [];
        const counts = {};

        products.forEach(product => {
          const catId = product.category_id;
          if (catId) {
            counts[catId] = (counts[catId] || 0) + 1;
          }
        });

        // Calculate parent category counts (sum of children)
        const calculateParentCounts = (cats) => {
          cats.forEach(cat => {
            if (cat.children && cat.children.length > 0) {
              calculateParentCounts(cat.children);
              const childSum = cat.children.reduce((sum, child) => {
                return sum + (counts[child.id] || 0);
              }, 0);
              counts[cat.id] = (counts[cat.id] || 0) + childSum;
            }
          });
        };

        calculateParentCounts(categoryData);
        setProductCounts(counts);
        setCategories(categoryData);
      } catch (err) {
        console.error('Category fetch error:', err);
        setCategories([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return { categories, productCounts, totalCount, loading };
}

// ==================== Helper Functions ====================
function flattenCategories(categories, result = []) {
  categories.forEach(cat => {
    result.push(cat);
    if (cat.children) {
      flattenCategories(cat.children, result);
    }
  });
  return result;
}

function getAllChildIds(categories, parentId) {
  const ids = [parentId];
  const findChildren = (cats) => {
    cats.forEach(cat => {
      if (cat.parentId === parentId || ids.includes(cat.parentId)) {
        ids.push(cat.id);
      }
      if (cat.children) {
        findChildren(cat.children);
      }
    });
  };
  findChildren(categories);
  return ids;
}

function convertToTreeData(categories, productCounts, searchValue) {
  const filterBySearch = (cats, text) => {
    if (!text) return cats;
    const lowerText = text.toLowerCase();

    return cats.reduce((acc, cat) => {
      const matchesName = cat.name?.toLowerCase().includes(lowerText);
      const filteredChildren = cat.children ? filterBySearch(cat.children, text) : [];

      if (matchesName || filteredChildren.length > 0) {
        acc.push({
          ...cat,
          children: filteredChildren.length > 0 ? filteredChildren : cat.children,
        });
      }
      return acc;
    }, []);
  };

  const filteredCategories = filterBySearch(categories, searchValue);

  const mapToTreeNode = (cat) => ({
    key: cat.id,
    title: (
      <Space style={styles.nodeTitle}>
        <Text>{cat.name}</Text>
        <Badge count={productCounts[cat.id] || 0} showZero color={T.colorBorderSecondary || '#d9d9d9'} style={{ color: T.colorTextSecondary || '#666' }} />
      </Space>
    ),
    children: cat.children?.map(mapToTreeNode),
  });

  return filteredCategories.map(mapToTreeNode);
}

// ==================== Components ====================
const CategoryTreeFilter = () => {
  const { categories, productCounts, totalCount, loading } = useCategoryData();
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [expandedKeys, setExpandedKeys] = useState([]);
  const [searchValue, setSearchValue] = useState('');

  const flatCategories = useMemo(() => flattenCategories(categories), [categories]);

  // Auto-expand first level on load
  useEffect(() => {
    if (categories.length > 0 && expandedKeys.length === 0) {
      setExpandedKeys(categories.map(c => c.id));
    }
  }, [categories]);

  const treeData = useMemo(
    () => convertToTreeData(categories, productCounts, searchValue),
    [categories, productCounts, searchValue]
  );

  const applyFilter = useCallback(async (categoryIds) => {
    try {
      const targetModel = ctx.engine?.getModel(TARGET_BLOCK_UID);
      if (!targetModel) {
        console.warn('Target block not found:', TARGET_BLOCK_UID);
        return;
      }

      if (categoryIds === null || categoryIds.length === 0) {
        targetModel.resource.addFilterGroup(ctx.model.uid, { $and: [] });
      } else {
        targetModel.resource.addFilterGroup(ctx.model.uid, {
          category_id: { $in: categoryIds },
        });
      }

      await targetModel.resource.refresh();
    } catch (error) {
      console.error('Filter failed:', error);
    }
  }, []);

  const handleSelect = useCallback((keys) => {
    if (keys.length === 0 || (selectedKeys.length > 0 && keys[0] === selectedKeys[0])) {
      setSelectedKeys([]);
      applyFilter(null);
    } else {
      const categoryId = keys[0];
      setSelectedKeys(keys);
      const allIds = getAllChildIds(flatCategories, categoryId);
      applyFilter([...new Set(allIds)]);
    }
  }, [selectedKeys, flatCategories, applyFilter]);

  const handleSelectAll = useCallback(() => {
    setSelectedKeys([]);
    applyFilter(null);
  }, [applyFilter]);

  const allProductsNode = {
    key: '__all__',
    title: (
      <Space style={styles.nodeTitle}>
        <Text strong>{t('All Products')}</Text>
        <Badge count={totalCount} showZero color={T.colorPrimary || '#1890ff'} />
      </Space>
    ),
  };

  if (loading) {
    return (
      <Card style={styles.card}>
        <div style={styles.loadingContainer}>
          <Spin />
        </div>
      </Card>
    );
  }

  return (
    <Card
      title={t('Product Categories')}
      size="small"
      style={styles.card}
      styles={{ body: styles.cardBody }}
    >
      <div style={styles.searchBox}>
        <Search
          placeholder={t('Search categories')}
          value={searchValue}
          onChange={e => setSearchValue(e.target.value)}
          allowClear
          size="small"
        />
      </div>

      <div style={styles.treeContainer}>
        <Tree
          treeData={[allProductsNode, ...treeData]}
          selectedKeys={selectedKeys.length === 0 ? ['__all__'] : selectedKeys}
          expandedKeys={expandedKeys}
          onSelect={(keys) => {
            if (keys[0] === '__all__') {
              handleSelectAll();
            } else {
              handleSelect(keys);
            }
          }}
          onExpand={setExpandedKeys}
          blockNode
        />
      </div>
    </Card>
  );
};

// ==================== Main ====================
ctx.render(<CategoryTreeFilter />);
