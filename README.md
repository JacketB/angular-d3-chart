# Angular D3 SCADA Chart Library

Библиотека предоставляет легковесный Angular-компонент на базе D3.js для визуализации многопоточных динамических данных (трендов) в реальном времени. Элементы графика оптимизированы для интеграции в SCADA и веб-интерфейсы систем мониторинга.

## Основные возможности

* **Динамическое обновление данных:** Обновление путей линий и подписей осей «на лету» через механизм Change Detection (включая Angular Signals) без полной перерисовки DOM-структуры SVG.
* **Интерактивный масштабируемый зум:** Выделение области графика мышью (Drag-and-Zoom) для фильтрации временного диапазона без прерывания потока данных. Сброс масштаба по двойному клику.
* **Интерактивный SVG-тултип:** Динамическое перекрестие (Crosshair) и информационное окно, отображающее точные значения всех параметров в ближайшей по времени точке.
* **Фильтрация разрывов:** Автоматическая визуализация непрерывных линий.

## Требования и зависимости

* Angular >= 17
* D3.js >= 7.0
* Moment.js >= 2.0

## Установка

Установите необходимые peer-зависимости в ваш проект:

```bash
npm install d3 moment
npm install @types/d3 --save-dev

```

## Использование

### 1. Подключение компонента

Импортируйте компонент `AngularD3ChartComponent` в ваш модуль или Standalone-компонент:

```typescript
import { Component, OnInit, signal } from '@angular/core';
import { AngularD3ChartComponent } from 'angular-d3-chart';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [AngularD3ChartComponent],
  templateUrl: './app.component.html'
})
export class AppComponent implements OnInit {
  chartDataSignal = signal<any[]>([]);
  
  linesConfig = [
    { key: 'param1', label: 'Температура' },
    { key: 'param2', label: 'Давление' }
  ];

  ngOnInit() {
    // Инициализация и логика реалтайм-обновления данных (например, через setInterval или WebSocket)
    this.chartDataSignal.set(this.getMockData());
  }

  private getMockData(): any[] {
    // Возвращает массив объектов с сигнатурой ChartData
    return [
      { id: 'p_1', time: new Date().toISOString(), param1: 420, param2: 310 }
    ];
  }
}

```

### 2. Шаблон компонента

Передайте конфигурацию и сигнал с данными во входные параметры компонента:

```html
<div style="width: 100%; height: 500px; position: relative;">
  <lib-angular-d3-chart 
    [chartData]="chartDataSignal()" 
    [linesConfig]="linesConfig"
    chartName="scadaLiveChart"
    [enableTooltip]="true"
    [chartHeight]="400">
  </lib-angular-d3-chart>
</div>

```

## API компонента

### Входные параметры (Inputs)

| Параметр | Тип | По умолчанию | Описание |
| --- | --- | --- | --- |
| `chartData` | `ChartData[]` | `[]` | Массив технологических данных для отображения. |
| `linesConfig` | `LineConfig[]` | `[]` | Конфигурация отображаемых линий (ключи и названия параметров). |
| `chartHeight` | `number` | `400` | Фиксированная высота графика в пикселях. |
| `chartName` | `string` | `'defaultChart'` | Уникальный идентификатор графика для изоляции DOM-элементов лоадера и линий. |
| `enableTooltip` | `boolean` | `true` | Флаг включения/выключения интерактивного перекрестия и всплывающего окна. |

### Структуры данных

**LineConfig:**

```typescript
export interface LineConfig {
  key: string;   // Ключ поля в объект данных (например, 'param1')
  label: string; // Отображаемое имя параметра в тултипе (например, 'Температура')
}

```

**ChartData:**

```typescript
export interface ChartData {
  id: string;    // Уникальный идентификатор точки
  time: string;  // Метка времени в формате ISO string
  [key: string]: any; // Динамические ключи параметров, описанные в LineConfig
}

```

## Стилизация

Стили графиков, сетки и элементов тултипа инкапсулированы внутри компонента. Для кастомизации цветовой палитры интерфейса используйте переопределение CSS-классов через глобальные стили приложения с селектором `::ng-deep`:

* `.svg-tooltip-bg` — фон и рамка всплывающего окна.
* `.tooltip-text` — параметры шрифта текста внутри тултипа.
* `.grid` — lines координатной сетки.
* `.loader` — стили индикатора загрузки.

```
