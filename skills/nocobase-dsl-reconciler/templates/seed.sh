#!/bin/bash
# 种子数据插入模板
# 用法: NB_URL=http://localhost:14000 bash seed.sh
#
# 修改下面的 COLLECTIONS 和 DATA 适配你的项目

NB_URL="${NB_URL:-http://localhost:14000}"
NB_USER="${NB_USER:-admin@nocobase.com}"
NB_PASSWORD="${NB_PASSWORD:-admin123}"

# 获取 token
TOKEN=$(curl -s "$NB_URL/api/auth:signIn" \
  -H 'Content-Type: application/json' \
  -d "{\"account\":\"$NB_USER\",\"password\":\"$NB_PASSWORD\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

if [ -z "$TOKEN" ]; then
  echo "❌ Login failed"
  exit 1
fi

echo "✓ Token obtained"

# 插入函数
insert() {
  local coll=$1
  local data=$2
  local result=$(curl -s -X POST "$NB_URL/api/$coll:create" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$data")
  local id=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('id','?'))" 2>/dev/null)
  echo "  + $coll #$id"
}

# ===== 修改下面的内容 =====

# 先插父表（无外键依赖）
echo "Members:"
insert nb_pm_members '{"name":"Alice Chen","email":"alice@example.com","role":"manager"}'
insert nb_pm_members '{"name":"Bob Wang","email":"bob@example.com","role":"developer"}'
insert nb_pm_members '{"name":"Carol Li","email":"carol@example.com","role":"designer"}'

echo "Projects:"
insert nb_pm_projects '{"name":"Website Redesign","status":"active","budget":50000,"managerId":1}'
insert nb_pm_projects '{"name":"Mobile App","status":"planning","budget":80000,"managerId":2}'
insert nb_pm_projects '{"name":"API Platform","status":"active","budget":120000,"managerId":1}'

# 再插子表（有外键 projectId, assigneeId 等）
# m2o 外键规则：字段名 + Id（如 project → projectId）
echo "Tasks:"
insert nb_pm_tasks '{"name":"Design mockups","status":"in_progress","priority":"high","projectId":1,"assigneeId":3}'
insert nb_pm_tasks '{"name":"Setup CI/CD","status":"todo","priority":"medium","projectId":1,"assigneeId":2}'
insert nb_pm_tasks '{"name":"Write API docs","status":"done","priority":"low","projectId":3,"assigneeId":2}'
insert nb_pm_tasks '{"name":"User research","status":"in_progress","priority":"high","projectId":2,"assigneeId":1}'
insert nb_pm_tasks '{"name":"Database schema","status":"todo","priority":"high","projectId":3,"assigneeId":2}'

echo "✓ Done"
