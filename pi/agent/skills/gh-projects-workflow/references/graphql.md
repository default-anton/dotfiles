# GitHub Projects v2 GraphQL (notes)

Used by `./scripts/gpw` via `gh api graphql`.

## Viewer id

```graphql
query {
  viewer { id login }
}
```

## List projects (pagination)

```graphql
query($after: String) {
  viewer {
    projectsV2(first: 100, after: $after) {
      nodes { id number title }
      pageInfo { hasNextPage endCursor }
    }
  }
}
```

## Create project

```graphql
mutation($ownerId: ID!, $title: String!) {
  createProjectV2(input:{ownerId:$ownerId, title:$title}) {
    projectV2 { id number title }
  }
}
```

## Read Status field + options

```graphql
query($projectId: ID!) {
  node(id: $projectId) {
    ... on ProjectV2 {
      fields(first: 50) {
        nodes {
          ... on ProjectV2SingleSelectField {
            id
            name
            options { id name }
          }
        }
      }
    }
  }
}
```

## Add draft issue (idea)

```graphql
mutation($projectId: ID!, $title: String!, $body: String!) {
  addProjectV2DraftIssue(input:{projectId:$projectId, title:$title, body:$body}) {
    projectItem { id }
  }
}
```

## Add issue to project

```graphql
mutation($projectId: ID!, $contentId: ID!) {
  addProjectV2ItemById(input:{projectId:$projectId, contentId:$contentId}) {
    item { id }
  }
}
```

## Set Status

```graphql
mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
  updateProjectV2ItemFieldValue(
    input:{
      projectId:$projectId,
      itemId:$itemId,
      fieldId:$fieldId,
      value:{ singleSelectOptionId:$optionId }
    }
  ) {
    projectV2Item { id }
  }
}
```
