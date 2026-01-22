#!/usr/bin/env bash
set -euo pipefail

# Shared lib for ./scripts/gpw

skill_dir() {
  cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1
  pwd
}

say() {
  printf '%s\n' "$*"
}

die() {
  say "gpw: $*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing command: $1"
}

gpw_require() {
  need_cmd gh
  need_cmd jq
}

gpw_user_login() {
  gh api user --jq .login
}

gpw_viewer_id() {
  gh api graphql -f query='query{viewer{id}}' --jq .data.viewer.id
}

gpw_repo_id() {
  local repo=$1
  gh repo view "$repo" --json id --jq .id
}

gpw_project_find_id_by_title() {
  local title=$1
  local after=""

  while :; do
    local args=( -f query='query($after:String){viewer{projectsV2(first:100,after:$after){nodes{id title number} pageInfo{hasNextPage endCursor}}}}' )
    if [[ -n "$after" ]]; then
      args+=( -F after="$after" )
    fi

    local resp
    resp="$(gh api graphql "${args[@]}")"

    local id
    id="$(jq -r --arg title "$title" '.data.viewer.projectsV2.nodes[]? | select(.title==$title) | .id' <<<"$resp" | head -n 1)"
    if [[ -n "$id" && "$id" != "null" ]]; then
      printf '%s' "$id"
      return 0
    fi

    local has_next
    has_next="$(jq -r '.data.viewer.projectsV2.pageInfo.hasNextPage' <<<"$resp")"
    if [[ "$has_next" != "true" ]]; then
      return 1
    fi
    after="$(jq -r '.data.viewer.projectsV2.pageInfo.endCursor' <<<"$resp")"
  done
}

gpw_projects_list_json() {
  local after=""
  local all='[]'

  while :; do
    local args=( -f query='query($after:String){viewer{projectsV2(first:100,after:$after){nodes{id title number} pageInfo{hasNextPage endCursor}}}}' )
    if [[ -n "$after" ]]; then
      args+=( -F after="$after" )
    fi

    local resp
    resp="$(gh api graphql "${args[@]}")"
    all="$(jq -c '.data.viewer.projectsV2.nodes' <<<"$resp" | jq -c --argjson all "$all" '$all + .' )"

    local has_next
    has_next="$(jq -r '.data.viewer.projectsV2.pageInfo.hasNextPage' <<<"$resp")"
    if [[ "$has_next" != "true" ]]; then
      break
    fi
    after="$(jq -r '.data.viewer.projectsV2.pageInfo.endCursor' <<<"$resp")"
  done

  printf '%s' "$all"
}

gpw_repo_default_branch() {
  local repo=$1
  gh repo view "$repo" --json defaultBranchRef --jq '.defaultBranchRef.name'
}

gpw_repo_default_branch_protect() {
  local repo=$1
  local branch
  branch="$(gpw_repo_default_branch "$repo")"

  local payload
  payload="$(jq -n '{
    required_status_checks: null,
    enforce_admins: true,
    required_pull_request_reviews: {required_approving_review_count: 1},
    restrictions: null,
    required_conversation_resolution: true
  }')"

  local err
  if ! err="$(gh api --method PUT "repos/${repo}/branches/${branch}/protection" --input - <<<"$payload" 2>&1)"; then
    err="$(tr '\n' ' ' <<<"$err")"
    say "gpw: warn: failed to protect default branch (repo=${repo} branch=${branch}): ${err:-unknown}; continue"
  fi
}

gpw_project_create() {
  local title=$1
  local owner_id
  owner_id="$(gpw_viewer_id)"

  gh api graphql \
    -f query='mutation($ownerId:ID!,$title:String!){createProjectV2(input:{ownerId:$ownerId,title:$title}){projectV2{id number title}}}' \
    -F ownerId="$owner_id" \
    -F title="$title" \
    --jq .data.createProjectV2.projectV2.id
}

gpw_project_ensure() {
  local title=$1

  local id
  if id="$(gpw_project_find_id_by_title "$title")"; then
    printf '%s' "$id"
    return 0
  fi

  gpw_project_create "$title"
}

gpw_project_status_field_json() {
  local project_id=$1

  gh api graphql \
    -f query='query($projectId:ID!){node(id:$projectId){... on ProjectV2{fields(first:50){nodes{... on ProjectV2SingleSelectField{id name options{id name color description}}}}}}}' \
    -F projectId="$project_id" \
    --jq '.data.node.fields.nodes[]? | select(.name=="Status")'
}

gpw_project_status_field_id() {
  local project_id=$1
  local json
  json="$(gpw_project_status_field_json "$project_id")"
  jq -r '.id' <<<"$json"
}

gpw_project_status_option_id() {
  local project_id=$1
  local name=$2

  local json
  json="$(gpw_project_status_field_json "$project_id")"
  jq -r --arg name "$name" '.options[]? | select(.name==$name) | .id' <<<"$json" | head -n 1
}

gpw_project_status_ensure_option() {
  local project_id=$1
  local name=$2

  local field_json
  field_json="$(gpw_project_status_field_json "$project_id")"

  local field_id
  field_id="$(jq -r '.id' <<<"$field_json")"

  local option_id
  option_id="$(jq -r --arg name "$name" '.options[]? | select(.name==$name) | .id' <<<"$field_json" | head -n 1)"
  if [[ -n "$option_id" && "$option_id" != "null" ]]; then
    printf '%s' "$option_id"
    return 0
  fi

  local options_json
  options_json="$(jq -c --arg name "$name" '(.options // []) | map({name, color, description}) + [{name:$name, color:"GRAY", description:""}]' <<<"$field_json")"

  local payload
  payload="$(jq -n --arg query 'mutation($fieldId:ID!,$options:[ProjectV2SingleSelectFieldOptionInput!]!){updateProjectV2Field(input:{fieldId:$fieldId,singleSelectOptions:$options}){projectV2Field{... on ProjectV2SingleSelectField{id}}}}' --arg fieldId "$field_id" --argjson options "$options_json" '{query:$query, variables:{fieldId:$fieldId, options:$options}}')"

  gh api graphql \
    --input - \
    --jq .data.updateProjectV2Field.projectV2Field.id \
    <<<"$payload" \
    >/dev/null

  gpw_project_status_option_id "$project_id" "$name"
}

gpw_project_status_ensure_defaults() {
  local project_id=$1

  gpw_project_status_ensure_option "$project_id" "Todo" >/dev/null
  gpw_project_status_ensure_option "$project_id" "In Progress" >/dev/null
  gpw_project_status_ensure_option "$project_id" "In Review" >/dev/null
  gpw_project_status_ensure_option "$project_id" "Done" >/dev/null
}

gpw_project_items_list_json() {
  local project_id=$1
  local after=""
  local all='[]'

  while :; do
    local args=(
      -f query='query($projectId:ID!,$after:String){node(id:$projectId){... on ProjectV2{items(first:100,after:$after){nodes{id content{__typename ... on DraftIssue{title body} ... on Issue{id number title url repository{nameWithOwner}} ... on PullRequest{id number title url repository{nameWithOwner}}} fieldValues(first:20){nodes{... on ProjectV2ItemFieldSingleSelectValue{field{... on ProjectV2SingleSelectField{name}} name}}} } pageInfo{hasNextPage endCursor}}}}}'
      -F projectId="$project_id"
    )
    if [[ -n "$after" ]]; then
      args+=( -F after="$after" )
    fi

    local resp
    resp="$(gh api graphql "${args[@]}")"

    all="$(jq -c '.data.node.items.nodes' <<<"$resp" | jq -c --argjson all "$all" '$all + .' )"

    local has_next
    has_next="$(jq -r '.data.node.items.pageInfo.hasNextPage' <<<"$resp")"
    if [[ "$has_next" != "true" ]]; then
      break
    fi
    after="$(jq -r '.data.node.items.pageInfo.endCursor' <<<"$resp")"
  done

  printf '%s' "$all"
}

gpw_project_item_node_json() {
  local item_id=$1

  gh api graphql \
    -f query='query($itemId:ID!){node(id:$itemId){... on ProjectV2Item{id content{__typename ... on DraftIssue{title body} ... on Issue{id number title url body repository{nameWithOwner}} ... on PullRequest{id number title url body repository{nameWithOwner}}}}}}' \
    -F itemId="$item_id" \
    --jq .data.node
}

gpw_project_item_status_name() {
  jq -r '[.fieldValues.nodes[]? | select(.field.name=="Status")][0].name // ""'
}

gpw_project_item_create_draft() {
  local project_id=$1
  local title=$2
  local body=$3

  gh api graphql \
    -f query='mutation($projectId:ID!,$title:String!,$body:String!){addProjectV2DraftIssue(input:{projectId:$projectId,title:$title,body:$body}){projectItem{id}}}' \
    -F projectId="$project_id" \
    -F title="$title" \
    -F body="$body" \
    --jq .data.addProjectV2DraftIssue.projectItem.id
}

gpw_project_item_convert_draft_to_issue_json() {
  local item_id=$1
  local repo_id=$2

  gh api graphql \
    -f query='mutation($itemId:ID!,$repositoryId:ID!){convertProjectV2DraftIssueItemToIssue(input:{itemId:$itemId,repositoryId:$repositoryId}){item{id content{... on Issue{id number title url repository{nameWithOwner}}}}}}' \
    -F itemId="$item_id" \
    -F repositoryId="$repo_id" \
    --jq .data.convertProjectV2DraftIssueItemToIssue.item
}

gpw_issue_graphql_id() {
  local repo=$1
  local issue=$2

  gh issue view "$issue" -R "$repo" --json id --jq .id
}

gpw_pr_graphql_id() {
  local repo=$1
  local pr=$2

  gh pr view "$pr" -R "$repo" --json id --jq .id
}

gpw_project_item_add_content() {
  local project_id=$1
  local content_id=$2

  gh api graphql \
    -f query='mutation($projectId:ID!,$contentId:ID!){addProjectV2ItemById(input:{projectId:$projectId,contentId:$contentId}){item{id}}}' \
    -F projectId="$project_id" \
    -F contentId="$content_id" \
    --jq .data.addProjectV2ItemById.item.id
}

gpw_project_item_find_by_content_id() {
  local project_id=$1
  local content_id=$2
  local after=""

  while :; do
    local args=( -f query='query($projectId:ID!,$after:String){node(id:$projectId){... on ProjectV2{items(first:100,after:$after){nodes{id content{... on Issue{id} ... on PullRequest{id}}} pageInfo{hasNextPage endCursor}}}}}' -F projectId="$project_id" )
    if [[ -n "$after" ]]; then
      args+=( -F after="$after" )
    fi

    local resp
    resp="$(gh api graphql "${args[@]}")"

    local item_id
    item_id="$(jq -r --arg cid "$content_id" '.data.node.items.nodes[]? | select(.content.id==$cid) | .id' <<<"$resp" | head -n 1)"
    if [[ -n "$item_id" && "$item_id" != "null" ]]; then
      printf '%s' "$item_id"
      return 0
    fi

    local has_next
    has_next="$(jq -r '.data.node.items.pageInfo.hasNextPage' <<<"$resp")"
    if [[ "$has_next" != "true" ]]; then
      return 1
    fi
    after="$(jq -r '.data.node.items.pageInfo.endCursor' <<<"$resp")"
  done
}

gpw_project_item_ensure_issue() {
  local project_id=$1
  local repo=$2
  local issue=$3

  local content_id
  content_id="$(gpw_issue_graphql_id "$repo" "$issue")"

  local item_id
  if item_id="$(gpw_project_item_find_by_content_id "$project_id" "$content_id")"; then
    printf '%s' "$item_id"
    return 0
  fi

  gpw_project_item_add_content "$project_id" "$content_id"
}

gpw_project_item_ensure_pr() {
  local project_id=$1
  local repo=$2
  local pr=$3

  local content_id
  content_id="$(gpw_pr_graphql_id "$repo" "$pr")"

  local item_id
  if item_id="$(gpw_project_item_find_by_content_id "$project_id" "$content_id")"; then
    printf '%s' "$item_id"
    return 0
  fi

  gpw_project_item_add_content "$project_id" "$content_id"
}

gpw_project_item_set_status() {
  local project_id=$1
  local item_id=$2
  local status_name=$3

  gpw_project_status_ensure_defaults "$project_id"

  local field_id option_id
  field_id="$(gpw_project_status_field_id "$project_id")"
  option_id="$(gpw_project_status_option_id "$project_id" "$status_name")"
  [[ -n "$option_id" && "$option_id" != "null" ]] || die "status option not found: $status_name"

  gh api graphql \
    -f query='mutation($projectId:ID!,$itemId:ID!,$fieldId:ID!,$optionId:String!){updateProjectV2ItemFieldValue(input:{projectId:$projectId,itemId:$itemId,fieldId:$fieldId,value:{singleSelectOptionId:$optionId}}){projectV2Item{id}}}' \
    -F projectId="$project_id" \
    -F itemId="$item_id" \
    -F fieldId="$field_id" \
    -F optionId="$option_id" \
    --jq .data.updateProjectV2ItemFieldValue.projectV2Item.id \
    >/dev/null
}

gpw_project_item_delete() {
  local project_id=$1
  local item_id=$2

  gh api graphql \
    -f query='mutation($projectId:ID!,$itemId:ID!){deleteProjectV2Item(input:{projectId:$projectId,itemId:$itemId}){deletedItemId}}' \
    -F projectId="$project_id" \
    -F itemId="$item_id" \
    --jq .data.deleteProjectV2Item.deletedItemId \
    >/dev/null
}

gpw_template() {
  cat <<'EOF'
## What

## Why

## How

## Verification
EOF
}

gpw_body_with_template() {
  local extra=${1:-}

  if [[ -z "$extra" ]]; then
    gpw_template
    return 0
  fi

  gpw_template
  printf '\n%s\n' "$extra"
}

gpw_repo_default_project_title() {
  local repo=$1
  printf '%s' "${repo#*/}"
}

gpw_repo_protect_main() {
  local repo=$1
  gpw_repo_default_branch_protect "$repo"
}
