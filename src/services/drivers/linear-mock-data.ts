import type { LinearIssuesResponse } from './linear';

export const MOCK_LINEAR_ISSUES_RESPONSE: LinearIssuesResponse = {
  issues: [
    {
      id: "3c00c903-ae15-4b5e-a9dd-d714f93409a4",
      identifier: "FUS-55",
      title: "Cleanup | Remove data/repositories/event.ts",
      description: "Remove data/repositories/event.ts and merge with org-scoped-db.ts… they are doing the same things.",
      priority: 3,
      url: "https://linear.app/pikoxfusion/issue/FUS-55/cleanup-or-remove-datarepositorieseventts",
      updatedAt: new Date("2025-08-01T04:24:11.990Z"),
      createdAt: new Date("2025-07-15T10:20:30.000Z"),
      state: {
        id: "state-todo",
        name: "Todo",
        color: "#e2e2e2",
        type: "unstarted"
      },
      assignee: {
        id: "user-austin",
        name: "Austin Smith",
        email: "austinsmith23@gmail.com",
        displayName: "Austin Smith"
      },
      creator: {
        id: "user-austin",
        name: "Austin Smith",
        email: "austinsmith23@gmail.com",
        displayName: "Austin Smith"
      },
      team: {
        id: "team-fusion",
        name: "Fusion Team",
        key: "FUS"
      },
      labels: [
        { id: "improvement-1", name: "Improvement", color: "#10b981" }
      ]
    },
    {
      id: "0fd4bab0-4371-4830-a0d5-7915f2996c32",
      identifier: "FUS-52",
      title: "Devices | Device onboarding wizard",
      priority: 0,
      url: "https://linear.app/pikoxfusion/issue/FUS-52/devices-or-device-onboarding-wizard",
      updatedAt: new Date("2025-07-31T19:54:27.286Z"),
      createdAt: new Date("2025-07-20T14:30:15.000Z"),
      state: {
        id: "state-backlog",
        name: "Backlog",
        color: "#bec2c8",
        type: "backlog"
      },
      assignee: {
        id: "user-austin",
        name: "Austin Smith",
        email: "austinsmith23@gmail.com",
        displayName: "Austin Smith"
      },
      creator: {
        id: "user-austin",
        name: "Austin Smith",
        email: "austinsmith23@gmail.com",
        displayName: "Austin Smith"
      },
      team: {
        id: "team-fusion",
        name: "Fusion Team",
        key: "FUS"
      },
      labels: [
        { id: "feature-1", name: "Feature", color: "#BB87FC" }
      ]
    },
    {
      id: "44234cc6-0cc3-4963-be83-19d81a582251",
      identifier: "FUS-47",
      title: "Set up proper domain",
      description: "# Prod\n\n---\n\nCurrently, the prod Fusion site is available at[ https://www.getfusion.io/](https://www.getfusion.io/.).\n\nInstead, make it available via[ https://app.getfusion.io/](https://app.getfusion.io/.) using the below config info…\n\n## **Configure DNS Records**\n\nTo finish setting up your custom domain, add the following DNS records to [getfusion.io](https://getfusion.io/):\n\n| Type | Name | Value |\n| -- | -- | -- |\n| CNAME | app | `nndizemc.up.railway.app` |\n\n# Non-prod\n\n---\n\nMake dev available at[ https://app.getfusion.dev/.](https://app.getfusion.dev/.) \n\n## **Configure DNS Records**\n\nTo finish setting up your custom domain, add the following DNS records to [getfusion.dev](https://getfusion.dev/)\n\n| Type | Name | Value |\n| -- | -- | -- |\n| CNAME | app | `1j7fbj7e.up.railway.app` |",
      priority: 4,
      url: "https://linear.app/pikoxfusion/issue/FUS-47/set-up-proper-domain",
      updatedAt: new Date("2025-08-01T02:39:31.270Z"),
      createdAt: new Date("2025-07-25T09:15:45.000Z"),
      state: {
        id: "state-in-progress",
        name: "In Progress",
        color: "#f2c94c",
        type: "started"
      },
      assignee: {
        id: "user-levi",
        name: "Levi Daily",
        email: "leviwaynedaily@gmail.com",
        displayName: "Levi Daily"
      },
      creator: {
        id: "user-austin",
        name: "Austin Smith",
        email: "austinsmith23@gmail.com",
        displayName: "Austin Smith"
      },
      team: {
        id: "team-fusion",
        name: "Fusion Team",
        key: "FUS"
      },
      labels: [
        { id: "improvement-2", name: "Improvement", color: "#4EA7FC" },
        { id: "feature-1", name: "Feature", color: "#BB87FC" }
      ]
    },
    {
      id: "4dcfe580-56df-49ab-b9b1-a76888dfafe7",
      identifier: "FUS-10",
      title: "Locations & Areas | Connectors w/ same name causes frontend display issues",
      description: "When two or more connectors share the same name, it causes two issues on the **Locations & Areas** page:\n\n* Visual data duplication (same device show up twice)\n* When associating devices to areas, only one of the connectors w/ duplicate names are displayed in \"Connectors\" dropdown",
      priority: 2,
      url: "https://linear.app/pikoxfusion/issue/FUS-10/locations-and-areas-or-connectors-w-same-name-causes-frontend-display",
      updatedAt: new Date("2025-07-15T18:35:47.057Z"),
      createdAt: new Date("2025-07-10T11:20:30.000Z"),
      state: {
        id: "state-done",
        name: "Done",
        color: "#5e6ad2",
        type: "completed"
      },
      assignee: {
        id: "user-austin",
        name: "Austin Smith",
        email: "austinsmith23@gmail.com",
        displayName: "Austin Smith"
      },
      creator: {
        id: "user-austin",
        name: "Austin Smith",
        email: "austinsmith23@gmail.com",
        displayName: "Austin Smith"
      },
      team: {
        id: "team-fusion",
        name: "Fusion Team",
        key: "FUS"
      },
      labels: [
        { id: "bug-1", name: "Bug", color: "#EB5757" }
      ]
    },
    {
      id: "3617199e-aeee-416b-9a71-8c300d9963b7",
      identifier: "FUS-4",
      title: "Connect GitHub or GitLab",
      description: "Connect your account to link issues to pull/merge requests and automate your workflow:\n\n* Link Linear issues to pull requests.\n* Automatically update an issue's status when PRs are created or merged.\n* Connect one or multiple repos.\n\n[Connect GitHub or GitLab →](https://linear.app/settings/integrations/github)\n\n## Setup tips\n\n#### How to link a Linear issue to a PR\n\n* **Branch name** (e.g. \"LIN-123\" or \"username/LIN-123\"). To quickly copy branch name for an issue to your clipboard, press `Cmd/Ctrl` `Shift` `.`\n* **Pull request title** (e.g. \"GitHub Workflow LIN-123\")\n* **Pull request description** (e.g. *Fixes LIN-123, Resolves LIN-123*) – it will not work if entered in commits or comments.\n\n#### When you link a Linear issue to a PR, Linear will:\n\n* Create a link to the PR in the Linear issue.\n* Comment on the PR with a link back to the Linear issue.\n* Once PR has been opened, Linear will change the status of the issue to \"In Progress\".\n* Once PR has been merged, Linear will change the status of the issue as \"Done\".\n\n#### Suggested Workflow\n\n1. Select or create the issue you want to work on next.\n2. Open the command menu (`Cmd` `K` on Mac, or `Ctrl` `K` on Windows) and select **Copy git branch name,** or use the shortcut `Cmd/Ctrl` `Shift` `.`\n3. This will copy the git branch name to your clipboard (e.g. `username/LIN-123-github-workflow`\n4. Paste the branch name to your git checkout command to create a new branch: `git checkout -b username/LIN-123-github-workflow`\n5. Make your changes and push the branch to GitHub and open a pull request\n6. Once the pull request is open, Linear will comment on the PR and change the issue state to **In Progress***.* \n7. Once the PR merged, Linear will change the status to Done.\n\nRead full integration instructions for [GitHub](https://linear.app/docs/github) and [GitLab →](https://linear.app/docs/gitlab)",
      priority: 1,
      url: "https://linear.app/pikoxfusion/issue/FUS-4/connect-github-or-gitlab",
      updatedAt: new Date("2025-07-04T23:22:53.219Z"),
      createdAt: new Date("2025-07-01T08:10:20.000Z"),
      state: {
        id: "state-canceled",
        name: "Canceled",
        color: "#95a2b3",
        type: "canceled"
      },
      assignee: undefined,
      creator: {
        id: "user-austin",
        name: "Austin Smith",
        email: "austinsmith23@gmail.com",
        displayName: "Austin Smith"
      },
      team: {
        id: "team-fusion",
        name: "Fusion Team",
        key: "FUS"
      },
      labels: []
    },
    {
      id: "5165c731-d28e-4628-b552-89c5baa2d37f",
      identifier: "FUS-41",
      title: "Events | Add initial Genea event support",
      description: "Add initial, limited Genea event parsing for \"Access Granted\" and \"Access Denied\" events. Below is the initial mapping for the supported event types:\n\n| **Code** | **Message** | **Type** | **Subtype** |\n| -- | -- | -- | -- |\n| SEQUR_ACCESS_DENIED_ACCESS_POINT_LOCKED | Access Denied - Door Is Locked | ACCESS_DENIED | DOOR_LOCKED |\n| SEQUR_ACCESS_DENIED_AFTER_EXPIRATION_DATE | Access Denied - Expired | ACCESS_DENIED | EXPIRED_CREDENTIAL |\n| SEQUR_ACCESS_DENIED_AIRLOCK | Access Denied - Airlock Is Busy | ACCESS_DENIED |  |\n| SEQUR_ACCESS_DENIED_ANTI_PASSBACK_VIOLATION | Access Denied - Anti-Passback Violation | ACCESS_DENIED | ANTIPASSBACK_VIOLATION |\n| SEQUR_ACCESS_DENIED_AREA_NOT_ENABLED | Access Denied - Area Not Enabled | ACCESS_DENIED |  |\n| SEQUR_ACCESS_DENIED_BEFORE_ACTIVATION_DATE | Access Denied - Not Active | ACCESS_DENIED |  |\n| SEQUR_ACCESS_DENIED_CARD_NOT_FOUND | Access Denied - Card/PIN Not Found | ACCESS_DENIED |  |\n| SEQUR_ACCESS_DENIED_COUNT_EXCEEDED | Access Denied - Count Exceeded | ACCESS_DENIED |  |\n| SEQUR_ACCESS_DENIED_DEACTIVATED_CARD | Access Denied - Card Access Revoked/ De-activated Card | ACCESS_DENIED |  |\n| SEQUR_ACCESS_DENIED_DURESS_code_DETECTED | Access Denied - Duress code Detected | ACCESS_DENIED | DURESS_PIN |\n| SEQUR_ACCESS_DENIED_ELEVATOR_FLOOR | Access Denied - Elevators Floor Not In Floors Served | ACCESS_DENIED |  |\n| SEQUR_ACCESS_DENIED_ELEVATOR_FLOOR_UNAUTHORIZED | Access Denied - Elevators Floor Request Not Authorized | ACCESS_DENIED |  |\n| SEQUR_ACCESS_DENIED_ELEVATOR_TIMEOUT | Access Denied - Elevators Timeout | ACCESS_DENIED |  |\n| SEQUR_ACCESS_DENIED_ELEVATOR_UNKNOWN_ERROR | Access Denied - Elevators Unknown Error | ACCESS_DENIED |  |\n| SEQUR_ACCESS_DENIED_HOST_APPROVAL_DENIED | Access Denied - Host Approval Denied | ACCESS_DENIED |  |\n| SEQUR_ACCESS_DENIED_HOST_APPROVAL_TIMEOUT | Access Denied - Host Approval Timed Out | ACCESS_DENIED |  |\n| SEQUR_ACCESS_DENIED_INCOMPLETE_CARD_PIN_SEQ | Access Denied - Incomplete CARD & PIN Sequence | ACCESS_DENIED |  |\n| SEQUR_ACCESS_DENIED_INVALID_FACILITY_code | Access Denied - Invalid Facility code | ACCESS_DENIED |  |\n| SEQUR_ACCESS_DENIED_INVALID_FORMAT | Access Denied - Card Format Not Matched | ACCESS_DENIED |  |\n| SEQUR_ACCESS_DENIED_INVALID_ISSUE_code | Access Denied - Invalid Issue code | ACCESS_DENIED |  |\n| SEQUR_ACCESS_DENIED_INVALID_PIN | Access Denied - Invalid PIN | ACCESS_DENIED | INVALID_CREDENTIAL |\n| SEQUR_ACCESS_DENIED_INVALID_TIME | Access Denied - Out Of Schedule | ACCESS_DENIED | NOT_IN_SCHEDULE |\n| SEQUR_ACCESS_DENIED_NO_DOOR_ACCESS | Access Denied - No Door Access | ACCESS_DENIED |  |\n| SEQUR_ACCESS_DENIED_NO_ESCORT_CARD | Access Denied - No Escort Card Presented | ACCESS_DENIED |  |\n| SEQUR_ACCESS_DENIED_NO_SECOND_CARD | Access Denied - No Second Card Presented | ACCESS_DENIED |  |\n| SEQUR_ACCESS_DENIED_OCCUPANCY_LIMIT_REACHED | Access Denied - Occupancy Limit Reached | ACCESS_DENIED | OCCUPANCY_LIMIT |\n| SEQUR_ACCESS_DENIED_UNAUTHORIZED_ASSETS | Access Denied - Unauthorized Assets | ACCESS_DENIED |  |\n| SEQUR_ACCESS_DENIED_USE_LIMIT | Access Denied - Use limit | ACCESS_DENIED |  |\n| SEQUR_ACCESS_GRANTED | Access Granted | ACCESS_GRANTED |  |\n| SEQUR_ACCESS_GRANTED_ACCESS_POINT_UNLOCKED | Access Granted | ACCESS_GRANTED |  |",
      priority: 2,
      url: "https://linear.app/pikoxfusion/issue/FUS-41/events-or-add-initial-genea-event-support",
      updatedAt: new Date("2025-07-30T01:11:09.539Z"),
      createdAt: new Date("2025-07-30T01:11:09.539Z"),
      state: {
        id: "state-in-progress",
        name: "In Progress",
        color: "#f2c94c",
        type: "started"
      },
      assignee: {
        id: "user-austin",
        name: "Austin Smith",
        email: "austinsmith23@gmail.com",
        displayName: "Austin Smith"
      },
      creator: {
        id: "user-austin",
        name: "Austin Smith",
        email: "austinsmith23@gmail.com",
        displayName: "Austin Smith"
      },
      team: {
        id: "team-fusion",
        name: "Fusion Team",
        key: "FUS"
      },
      labels: []
    }
  ],
  pageInfo: {
    hasNextPage: false,
    endCursor: "21d08300-be22-454d-9f17-2cd4dae69568"
  },
  totalCount: 6
};