<script setup>
import DuplicateIncidentStatus from "./DuplicateIncidentStatus.vue";
import HandoverReadinessBar from "./HandoverReadinessBar.vue";
import HandoverSummaryStatus from "./HandoverSummaryStatus.vue";
import IncidentFields from "./IncidentFields.vue";
import IncidentHistory from "./IncidentHistory.vue";
import IncidentHistoryStatus from "./IncidentHistoryStatus.vue";
import IncidentPanelHeader from "./IncidentPanelHeader.vue";
import IncidentWorkflow from "./IncidentWorkflow.vue";
import JiraStatus from "./JiraStatus.vue";
import { useIncidentHistoryApiBridge } from "../composables/useIncidentHistoryApiBridge";
import { useIncidentStateBridge } from "../composables/useIncidentStateBridge";

useIncidentHistoryApiBridge();
useIncidentStateBridge();
</script>

<template>
    <section class="incident-panel">
      <IncidentPanelHeader />
      <HandoverReadinessBar />
      <JiraStatus />
      <HandoverSummaryStatus />
      <DuplicateIncidentStatus />
      <IncidentHistoryStatus />

      <IncidentFields />

      <IncidentWorkflow />

      <IncidentHistory />
    </section>
</template>
