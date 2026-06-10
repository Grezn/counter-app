<script setup>
import { useIncidentServiceDetails } from "../composables/useIncidentServiceDetails";

const {
  followupOptions,
  getField,
  hint: serviceTypeHint,
  isCustomerOptions,
  isCustomerSelected,
  isFollowupOtherVisible,
  isFollowupSelected,
  isSectionVisible,
  isServiceTypeSelected,
  isServiceTypeOtherVisible,
  productOptions,
  setField,
  setFollowup,
  setIsCustomer,
  setServiceType,
  serviceTypeOptions,
} = useIncidentServiceDetails();
</script>

<template>
  <details class="incident-details">
    <summary>報修表單補充資訊</summary>
    <div class="details-grid">
      <div class="field full" data-service-section="base">
        <label>服務類型</label>
        <div class="choice-group">
          <label v-for="serviceType in serviceTypeOptions" :key="serviceType" class="choice-item">
            <input
              type="radio"
              name="serviceType"
              :value="serviceType"
              data-incident-radio="serviceType"
              :checked="isServiceTypeSelected(serviceType)"
              @change="setServiceType($event.target.value)"
            />
            {{ serviceType }}
          </label>
        </div>
        <input id="incidentServiceTypeOther" type="text" data-incident-field="serviceTypeOther" data-service-section="other" :hidden="!isServiceTypeOtherVisible" :value="getField('serviceTypeOther')" placeholder="服務類型為其他時填寫" @input="setField('serviceTypeOther', $event.target.value)" />
        <div id="serviceTypeHint" class="service-type-hint">{{ serviceTypeHint }}</div>
      </div>

      <div class="field" data-service-section="repair aws" :hidden="!isSectionVisible('repair aws')">
        <label for="incidentProductName">產品名稱</label>
        <select id="incidentProductName" data-incident-field="productName" :value="getField('productName')" @change="setField('productName', $event.target.value)">
          <option value="">選取產品</option>
          <option v-for="product in productOptions" :key="product" :value="product">{{ product }}</option>
        </select>
      </div>

      <div class="field" data-service-section="repair" :hidden="!isSectionVisible('repair')">
        <label for="incidentContractId">合約編號</label>
        <input id="incidentContractId" type="text" data-incident-field="contractId" :value="getField('contractId')" placeholder="無則填無" @input="setField('contractId', $event.target.value)" />
      </div>

      <div class="field" data-service-section="repair" :hidden="!isSectionVisible('repair')">
        <label for="incidentSerial">產品序號</label>
        <input id="incidentSerial" type="text" data-incident-field="serial" :value="getField('serial')" placeholder="無則填無" @input="setField('serial', $event.target.value)" />
      </div>

      <div class="field" data-service-section="repair" :hidden="!isSectionVisible('repair')">
        <label for="incidentModel">產品型號</label>
        <input id="incidentModel" type="text" data-incident-field="model" :value="getField('model')" placeholder="無則填無" @input="setField('model', $event.target.value)" />
      </div>

      <div class="field" data-service-section="repair" :hidden="!isSectionVisible('repair')">
        <label for="incidentDealer">經銷商名稱</label>
        <input id="incidentDealer" type="text" data-incident-field="dealer" :value="getField('dealer')" placeholder="輸入經銷商名稱" @input="setField('dealer', $event.target.value)" />
      </div>

      <div class="field" data-service-section="repair" :hidden="!isSectionVisible('repair')">
        <label for="incidentRepairTarget">報修對象</label>
        <input id="incidentRepairTarget" type="text" data-incident-field="repairTarget" :value="getField('repairTarget')" placeholder="客戶 / 經銷商 / 內部單位" @input="setField('repairTarget', $event.target.value)" />
      </div>

      <div class="field" data-service-section="repair aws other" :hidden="!isSectionVisible('repair aws other')">
        <label for="incidentOwner">負責業務 / 工程師</label>
        <input id="incidentOwner" type="text" data-incident-field="owner" :value="getField('owner')" placeholder="對接窗口" @input="setField('owner', $event.target.value)" />
      </div>

      <div class="field" data-service-section="repair aws other" :hidden="!isSectionVisible('repair aws other')">
        <label for="incidentContactMethod">聯繫方式 / 稱呼</label>
        <input id="incidentContactMethod" type="text" data-incident-field="contactMethod" :value="getField('contactMethod')" @input="setField('contactMethod', $event.target.value)" />
      </div>

      <div class="field" data-service-section="repair aws other" :hidden="!isSectionVisible('repair aws other')">
        <label>是否為客戶</label>
        <div class="choice-group">
          <label v-for="option in isCustomerOptions" :key="option" class="choice-item">
            <input
              type="radio"
              name="isCustomer"
              :value="option"
              data-incident-radio="isCustomer"
              :checked="isCustomerSelected(option)"
              @change="setIsCustomer($event.target.value)"
            />
            {{ option }}
          </label>
        </div>
      </div>

      <div class="field full" data-service-section="base">
        <label>後續處理方式</label>
        <div class="choice-group">
          <label v-for="followup in followupOptions" :key="followup" class="choice-item">
            <input
              type="checkbox"
              :data-incident-followup="followup"
              :checked="isFollowupSelected(followup)"
              @change="setFollowup(followup, $event.target.checked)"
            />
            {{ followup }}
          </label>
        </div>
        <input id="incidentFollowupOther" type="text" data-incident-field="followupOther" :hidden="!isFollowupOtherVisible" :value="getField('followupOther')" placeholder="後續處理方式為其他時填寫" @input="setField('followupOther', $event.target.value)" />
      </div>

      <div class="field full" data-service-section="base">
        <label for="incidentExtraInfo">其他補充</label>
        <textarea id="incidentExtraInfo" data-incident-field="extraInfo" :value="getField('extraInfo')" @input="setField('extraInfo', $event.target.value)"></textarea>
      </div>
    </div>
  </details>
</template>
