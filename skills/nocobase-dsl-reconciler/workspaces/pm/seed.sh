#!/bin/bash
NB_URL="${NB_URL:-http://localhost:14000}"
NB_USER="${NB_USER:-admin@nocobase.com}"
NB_PASSWORD="${NB_PASSWORD:-admin123}"

TOKEN=$(curl -s "$NB_URL/api/auth:signIn" \
  -H 'Content-Type: application/json' \
  -d "{\"account\":\"$NB_USER\",\"password\":\"$NB_PASSWORD\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

if [ -z "$TOKEN" ]; then echo "❌ Login failed"; exit 1; fi
echo "✓ Token obtained"

insert() {
  local coll=$1
  local data=$2
  local result
  result=$(curl -s -X POST "$NB_URL/api/$coll:create" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$data")
  local id
  id=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('id','?'))" 2>/dev/null)
  echo "$id"
}

echo "Members:"
M1=$(insert nb_pm_members '{"name":"Alice Chen","email":"alice@example.com","role":"manager"}')
M2=$(insert nb_pm_members '{"name":"Bob Wang","email":"bob@example.com","role":"developer"}')
M3=$(insert nb_pm_members '{"name":"Carol Li","email":"carol@example.com","role":"designer"}')
M4=$(insert nb_pm_members '{"name":"David Zhang","email":"david@example.com","role":"developer"}')
M5=$(insert nb_pm_members '{"name":"Eve Liu","email":"eve@example.com","role":"designer"}')
echo "  Alice=$M1 Bob=$M2 Carol=$M3 David=$M4 Eve=$M5"

echo "Projects:"
P1=$(insert nb_pm_projects "{\"name\":\"Website Redesign\",\"description\":\"Redesign company website\",\"status\":\"active\",\"priority\":\"high\",\"start_date\":\"2024-01-01\",\"end_date\":\"2024-03-31\",\"budget\":50000,\"managerId\":$M1}")
P2=$(insert nb_pm_projects "{\"name\":\"Mobile App\",\"description\":\"Build iOS and Android apps\",\"status\":\"planning\",\"priority\":\"medium\",\"start_date\":\"2024-02-01\",\"end_date\":\"2024-06-30\",\"budget\":80000,\"managerId\":$M2}")
P3=$(insert nb_pm_projects "{\"name\":\"API Platform\",\"description\":\"Internal API gateway\",\"status\":\"active\",\"priority\":\"high\",\"start_date\":\"2024-01-15\",\"end_date\":\"2024-05-15\",\"budget\":120000,\"managerId\":$M1}")
P4=$(insert nb_pm_projects "{\"name\":\"Data Migration\",\"description\":\"Migrate legacy data\",\"status\":\"on_hold\",\"priority\":\"low\",\"start_date\":\"2024-03-01\",\"end_date\":\"2024-04-15\",\"budget\":30000,\"managerId\":$M3}")
P5=$(insert nb_pm_projects "{\"name\":\"AI Dashboard\",\"description\":\"Analytics with ML\",\"status\":\"completed\",\"priority\":\"medium\",\"start_date\":\"2023-10-01\",\"end_date\":\"2023-12-31\",\"budget\":95000,\"managerId\":$M2}")
echo "  Website=$P1 Mobile=$P2 API=$P3 Migration=$P4 AI=$P5"

echo "Tasks:"
T1=$(insert nb_pm_tasks "{\"name\":\"Design mockups\",\"description\":\"Create Figma mockups\",\"status\":\"in_progress\",\"priority\":\"high\",\"due_date\":\"2024-02-15\",\"projectId\":$P1,\"assigneeId\":$M3}")
T2=$(insert nb_pm_tasks "{\"name\":\"Setup CI/CD\",\"description\":\"GitHub Actions pipeline\",\"status\":\"todo\",\"priority\":\"medium\",\"due_date\":\"2024-02-20\",\"projectId\":$P1,\"assigneeId\":$M2}")
T3=$(insert nb_pm_tasks "{\"name\":\"Write API docs\",\"description\":\"OpenAPI documentation\",\"status\":\"done\",\"priority\":\"low\",\"due_date\":\"2024-01-30\",\"projectId\":$P3,\"assigneeId\":$M2}")
T4=$(insert nb_pm_tasks "{\"name\":\"User research\",\"description\":\"Interview 20 users\",\"status\":\"in_progress\",\"priority\":\"high\",\"due_date\":\"2024-02-28\",\"projectId\":$P2,\"assigneeId\":$M3}")
T5=$(insert nb_pm_tasks "{\"name\":\"Database schema\",\"description\":\"Design PostgreSQL schema\",\"status\":\"todo\",\"priority\":\"high\",\"due_date\":\"2024-02-10\",\"projectId\":$P3,\"assigneeId\":$M4}")
T6=$(insert nb_pm_tasks "{\"name\":\"Homepage hero\",\"description\":\"Hero section redesign\",\"status\":\"done\",\"priority\":\"medium\",\"due_date\":\"2024-01-20\",\"projectId\":$P1,\"assigneeId\":$M3}")
T7=$(insert nb_pm_tasks "{\"name\":\"Push notifications\",\"description\":\"FCM integration\",\"status\":\"todo\",\"priority\":\"high\",\"due_date\":\"2024-03-15\",\"projectId\":$P2,\"assigneeId\":$M4}")
T8=$(insert nb_pm_tasks "{\"name\":\"Load testing\",\"description\":\"K6 performance tests\",\"status\":\"review\",\"priority\":\"medium\",\"due_date\":\"2024-02-25\",\"projectId\":$P3,\"assigneeId\":$M2}")
echo "  Tasks: $T1 $T2 $T3 $T4 $T5 $T6 $T7 $T8"

echo "✓ Done"
