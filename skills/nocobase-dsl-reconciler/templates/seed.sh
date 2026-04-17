#!/bin/bash
# Seed data template — insert test data after deploy
#
# Usage: NB_URL=http://localhost:14000 bash seed.sh
#
# IMPORTANT: m2o foreign key naming rule:
#   field name + "Id" = FK column name
#   Examples:
#     department (m2o → nb_hrm_departments) → use "departmentId": 1
#     project    (m2o → nb_pm_projects)     → use "projectId": 1
#     assignee   (m2o → nb_pm_members)      → use "assigneeId": 1
#     manager    (m2o → nb_pm_members)      → use "managerId": 1
#
# Insert parent tables FIRST (no FK dependencies), then child tables.

NB_URL="${NB_URL:-http://localhost:14000}"

# Get token
TOKEN=$(curl -s "$NB_URL/api/auth:signIn" \
  -H 'Content-Type: application/json' \
  -d '{"account":"admin@nocobase.com","password":"admin123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

[ -z "$TOKEN" ] && echo "Login failed" && exit 1

insert() {
  curl -s -X POST "$NB_URL/api/$1:create" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$2" > /dev/null && echo "  + $1"
}

# ===== EDIT BELOW =====

# 1. Parent tables (no foreign keys)
echo "Departments:"
insert nb_hrm_departments '{"name":"Engineering"}'
insert nb_hrm_departments '{"name":"Marketing"}'
insert nb_hrm_departments '{"name":"HR"}'

# 2. Child tables (with FK: departmentId = department field + "Id")
echo "Employees:"
insert nb_hrm_employees '{"name":"Alice","email":"alice@test.com","departmentId":1}'
insert nb_hrm_employees '{"name":"Bob","email":"bob@test.com","departmentId":2}'
insert nb_hrm_employees '{"name":"Carol","email":"carol@test.com","departmentId":1}'

echo "Done"
