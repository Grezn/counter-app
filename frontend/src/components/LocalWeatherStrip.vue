<script setup>
import { useLocalWeather } from "../composables/useLocalWeather";

const { configureWeatherLocation, loadLocalWeather, weather } = useLocalWeather();
</script>

<template>
  <section class="weather-strip" aria-label="本地即時氣象">
    <div class="weather-header">
      <div>
        <h2 class="weather-title">本地即時氣象</h2>
        <div id="weatherMeta" class="weather-meta">{{ weather.meta }}</div>
      </div>
      <div class="weather-actions">
        <button class="weather-refresh" type="button" @click="configureWeatherLocation">地區</button>
        <button class="weather-refresh" type="button" @click="loadLocalWeather(true)">更新</button>
      </div>
    </div>

    <div id="weatherContent" class="weather-content" aria-live="polite">
      <template v-if="weather.ready">
        <div class="weather-summary">
          <strong class="weather-temp">{{ weather.temperature }}</strong>
          <div class="weather-summary-text">
            <span class="weather-now">{{ weather.weatherLabel }}</span>
            <span class="weather-forecast-note">{{ weather.forecastNote }}</span>
          </div>
          <span class="weather-sticker" role="img" :aria-label="weather.sticker.label">
            {{ weather.sticker.icon }}
          </span>
        </div>
        <div v-for="chip in weather.chips" :key="chip.label" class="weather-chip">
          <span class="weather-chip-label">{{ chip.label }}</span>
          <strong class="weather-chip-value">{{ chip.value }}</strong>
        </div>
      </template>
      <div v-else class="weather-placeholder">{{ weather.placeholder }}</div>
    </div>
  </section>
</template>
