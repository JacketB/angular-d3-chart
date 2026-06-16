import {
  Component,
  OnInit,
  input,
  effect,
  ElementRef,
  ViewChild,
  Inject,
  PLATFORM_ID,
  HostListener,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ChartData, LineConfig } from './scada-data';
import { ChartGeneratorService } from './chart-generator-service';
import * as d3 from 'd3';

@Component({
  selector: 'lib-angular-d3-chart',
  standalone: true,
  imports: [CommonModule],
  providers: [ChartGeneratorService],
  templateUrl: './angular-d3-chart.component.html',
  styleUrl: './angular-d3-chart.component.css',
})
export class AngularD3ChartComponent implements OnInit {
  @ViewChild('chartContainer', { static: true }) chartContainer!: ElementRef;

  chartData = input<ChartData[]>([]);
  linesConfig = input<LineConfig[]>([]);
  chartWidth = input<number>(800);
  chartHeight = input<number>(400);
  chartName = input<string>('defaultChart');
  enableTooltip = input<boolean>(true);
  zoomMode = input<'freeze' | 'scroll'>('freeze');

  chartId = 'chart';
  private displayData: ChartData[] = [];
  margin = { top: 10, right: 30, bottom: 40, left: 30 };
  width = 0;
  isBrowser = false;

  private svgGraph: any;
  private svgContainerRef: any;
  private colorScale: any;

  private lastMouseCoordinates: [number, number] | null = null;
  private zoomStartDate: Date | null = null;
  private zoomEndDate: Date | null = null;
  private zoomDurationMs: number | null = null;

  constructor(
    private chartService: ChartGeneratorService,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);

    effect(
      () => {
        const rawData = this.chartData();
        const configs = this.linesConfig();
        const mode = this.zoomMode();

        if (this.isBrowser) {
          this.calculateWidth();

          if (this.zoomStartDate && this.zoomEndDate) {
            if (mode === 'scroll' && this.zoomDurationMs && rawData.length > 0) {
              const lastPointTime =
                d3.isoParse(rawData[rawData.length - 1].time)?.getTime() || Date.now();
              this.zoomEndDate = new Date(lastPointTime);
              this.zoomStartDate = new Date(lastPointTime - this.zoomDurationMs);

              const filtered = this.chartService.filterDataByDateRange(
                rawData,
                this.zoomStartDate,
                this.zoomEndDate,
              );

              if (filtered.length > 1) {
                this.zoomStartDate = d3.isoParse(filtered[0].time) || this.zoomStartDate;
                this.zoomEndDate =
                  d3.isoParse(filtered[filtered.length - 1].time) || this.zoomEndDate;
                this.displayData = filtered;
              } else {
                this.displayData = [...rawData];
                this.resetZoomState();
              }
            } else {
              this.displayData = this.chartService.filterDataByDateRange(
                rawData,
                this.zoomStartDate,
                this.zoomEndDate,
              );
            }
          } else {
            this.displayData = [...rawData];
          }

          if (!this.svgGraph) {
            this.showLoader();
            this.buildChart();
          } else {
            this.updateChartState();
          }
        }
      },
      { allowSignalWrites: true },
    );
  }

  ngOnInit(): void {
    this.displayData = [...this.chartData()];
  }

  private resetZoomState(): void {
    this.zoomStartDate = null;
    this.zoomEndDate = null;
    this.zoomDurationMs = null;
  }

  toggleLine(line: LineConfig): void {
    line.visible = line.visible !== false ? false : true;
    this.updateChartState(true);
  }

  getLineColor(key: string): string {
    return this.colorScale ? this.colorScale(key) : '#ccc';
  }

  @HostListener('window:resize')
  onResize(): void {
    if (!this.isBrowser) return;
    this.showLoader();
    this.calculateWidth();
    this.buildChart();
  }

  private showLoader(): void {
    const loader = document.getElementById('loader' + this.chartName());
    if (loader) loader.style.display = 'block';
  }

  private calculateWidth(): void {
    const containerElement = this.chartContainer.nativeElement;
    const containerWidth = containerElement.offsetWidth || window.innerWidth * 0.8;
    this.width = containerWidth;
  }

  private buildChart(): void {
    const container = d3.select(this.chartContainer.nativeElement);
    container.selectAll('*').remove();

    const keys = this.linesConfig().map((c) => c.key);
    this.colorScale = d3.scaleOrdinal<string>().domain(keys).range(d3.schemeCategory10);

    this.svgContainerRef = container
      .append('svg')
      .attr('width', this.width)
      .attr('height', this.chartHeight() + this.margin.top + this.margin.bottom);

    this.svgGraph = this.svgContainerRef
      .append('g')
      .attr('transform', `translate(${this.margin.left}, ${this.margin.top})`)
      .attr('id', this.chartId);

    const daterange: [Date, Date] | undefined =
      this.zoomStartDate && this.zoomEndDate ? [this.zoomStartDate, this.zoomEndDate] : undefined;

    this.chartService.initializeChart(
      this.displayData,
      this.linesConfig(),
      this.width,
      this.chartHeight(),
      this.chartName(),
      this.enableTooltip(),
      this.svgGraph,
      daterange,
    );

    this.addZoomSelection(this.svgContainerRef, this.svgGraph);
    this.svgContainerRef.on('dblclick', () => this.resetZoom());
    this.refreshTooltipEvents();
  }

  private updateChartState(animate = false): void {
    if (!this.svgGraph) return;

    const daterange: [Date, Date] | undefined =
      this.zoomStartDate && this.zoomEndDate ? [this.zoomStartDate, this.zoomEndDate] : undefined;

    this.chartService.updateChart(
      this.displayData,
      this.linesConfig(),
      this.chartName(),
      this.svgGraph,
      this.width - 35,
      this.chartHeight(),
      this.enableTooltip(),
      daterange,
      animate,
    );

    if (this.enableTooltip() && this.lastMouseCoordinates) {
      this.triggerTooltipManualUpdate();
    }
  }

  private triggerTooltipManualUpdate(): void {
    if (!this.lastMouseCoordinates || !this.svgGraph) return;

    const daterange: [Date, Date] | undefined =
      this.zoomStartDate && this.zoomEndDate ? [this.zoomStartDate, this.zoomEndDate] : undefined;

    const extent = this.chartService.getTimeExtent(this.displayData);

    const [x, y] = this.chartService.getScales(
      extent,
      this.width - 35,
      this.chartHeight(),
      daterange,
      this.displayData,
      this.linesConfig(),
    );

    const focus = this.svgGraph.select('.focus-group');
    const tooltipGroup = this.svgGraph.select('.svg-tooltip-container');
    const tooltipRect = tooltipGroup.select('.tooltip-bg');
    const tooltipText = tooltipGroup.select('.tooltip-text');

    if (!focus.empty() && !tooltipGroup.empty() && this.displayData.length > 0) {
      this.chartService.renderTooltipAtCoordinates(
        this.lastMouseCoordinates,
        x,
        y,
        this.displayData,
        this.linesConfig(),
        focus,
        tooltipGroup,
        tooltipRect,
        tooltipText,
        this.width - 35,
        this.chartHeight(),
        this.colorScale,
      );
    }
  }

  private refreshTooltipEvents(): void {
    if (!this.enableTooltip() || !this.svgGraph) return;

    this.svgGraph
      .selectAll('.overlay')
      .on('mouseover', () => {
        this.svgGraph.select('.focus-group').style('display', null);
      })
      .on('mouseout', () => {
        this.svgGraph.select('.focus-group').style('display', 'none');
        this.svgGraph.select('.svg-tooltip-container').style('opacity', 0);
        this.lastMouseCoordinates = null;
      })
      .on('mousemove', (event: any) => {
        this.lastMouseCoordinates = d3.pointer(event, event.currentTarget);
        this.triggerTooltipManualUpdate();
      });
  }

  private resetZoom(): void {
    this.showLoader();
    this.resetZoomState();
    this.displayData = [...this.chartData()];
    this.buildChart();
  }

  addZoomSelection(svgContainer: any, graph: any): void {
    let selectedAreaStartX: number | null = null;
    let selectedAreaEndX: number | null = null;

    const updateSelectedArea = () => {
      graph.selectAll('.selected-area').remove();
      if (selectedAreaStartX !== null && selectedAreaEndX !== null) {
        const x1 = Math.min(selectedAreaStartX, selectedAreaEndX);
        const x2 = Math.max(selectedAreaStartX, selectedAreaEndX);
        graph
          .append('rect')
          .attr('class', 'selected-area')
          .attr('x', x1)
          .attr('y', 0)
          .attr('width', Math.abs(x2 - x1))
          .attr('height', this.chartHeight())
          .attr('fill', '#5f5f5f36');
      }
    };

    const handleSelection = () => {
      if (selectedAreaStartX !== null && selectedAreaEndX !== null) {
        if (Math.abs(selectedAreaStartX - selectedAreaEndX) > 5) {
          this.showLoader();

          const daterange: [Date, Date] | undefined =
            this.zoomStartDate && this.zoomEndDate
              ? [this.zoomStartDate, this.zoomEndDate]
              : undefined;

          const xScale = this.chartService.getXScale(this.displayData, this.width - 35, daterange);

          this.zoomStartDate = xScale.invert(Math.min(selectedAreaStartX, selectedAreaEndX));
          this.zoomEndDate = xScale.invert(Math.max(selectedAreaStartX, selectedAreaEndX));

          this.zoomDurationMs = this.zoomEndDate!.getTime() - this.zoomStartDate!.getTime();

          this.displayData = this.chartService.filterDataByDateRange(
            this.chartData(),
            this.zoomStartDate!,
            this.zoomEndDate!,
          );
          this.updateChartState();
        }
        selectedAreaStartX = null;
        selectedAreaEndX = null;
        graph.selectAll('.selected-area').remove();
      }
    };

    const drag = d3
      .drag<SVGSVGElement, any>()
      .on('start', (event) => {
        const coords = d3.pointer(event, graph.node());
        selectedAreaStartX = coords[0];
        selectedAreaEndX = coords[0];
        updateSelectedArea();
      })
      .on('drag', (event) => {
        const coords = d3.pointer(event, graph.node());
        selectedAreaEndX = coords[0];
        updateSelectedArea();
      })
      .on('end', handleSelection);

    svgContainer.call(drag);
  }
}
