import { Injectable } from '@angular/core';
import { ChartData, LineConfig } from './scada-data';
import * as d3 from 'd3';
import moment from 'moment';

@Injectable()
export class ChartGeneratorService {
  
  initializeChart(data: ChartData[], configs: LineConfig[], width: number, height: number, chartName: string, isTooltip: boolean = false, svg?: any, daterange?: any) {
    if (!svg) svg = d3.select(`#chart`);
    svg.selectAll("*").remove();

    if (data.length === 0) {
      this.renderNoData(svg, width, height);
      this.toggleLoader(chartName, false);
      return;
    }

    const firstLineId = `${chartName}_${configs[0].key}_0`;
    if (this.isChartGenerated(firstLineId)) {
      this.updateChart(data, configs, chartName, svg, width - 35, height, isTooltip);
      this.toggleLoader(chartName, false);
      return;
    }

    const extent: any = this.getTimeExtent(data);
    const [x, y] = this.getScales(extent, width - 35, height, daterange);
    
    this.appendGrid(svg, x, y, width - 35, height);
    this.appendClipPath(svg, width - 35, height);
    
    const chartBody = this.appendChartBody(svg);
    
    const keys = configs.map(c => c.key);
    const colorScale = d3.scaleOrdinal<string>().domain(keys).range(d3.schemeCategory10);
    
    this.renderLines(chartBody, data, configs, x, y, chartName, colorScale);
    this.toggleLoader(chartName, false);

    if (isTooltip) {
      this.createFocusAndTooltip(svg, width - 35, height, data, configs, x, y, colorScale);
    }
  }

  isChartGenerated(svgId: string): boolean {
    return document.getElementById(svgId) !== null;
  }

  updateChart(data: ChartData[], configs: LineConfig[], chartName: string, svg: any, width: number, height: number, isTooltip: boolean) {
    svg.selectAll('.axisWhite, .focusLine, .focusCircle, .tooltip-bg, .tooltip-text, .overlay, .svg-tooltip-container, .focus-group').remove();

    if (data.length === 0) {
      this.renderNoData(svg, width, height);
      this.toggleLoader(chartName, false);
      return;
    }

    const extent: any = this.getTimeExtent(data);
    const [x, y] = this.getScales(extent, width, height);

    const xAxisGrid = d3.axisBottom(x).tickSize(-height)
      .tickFormat((d: any) => d3.timeFormat(width < 1000 ? "%H:%M:%S" : "%d.%m.%y %H:%M:%S")(d));
    
    const yTicks = y.ticks().filter((t: any) => t !== 0);
    const yAxisGrid = d3.axisLeft(y).tickSize(-width).tickFormat(null).tickValues(yTicks);

    if (!svg.select('.x-axis').empty() && !svg.select('.y-axis').empty()) {
      svg.select('.x-axis').call(xAxisGrid);
      svg.select('.y-axis').call(yAxisGrid);
      
      svg.selectAll('.grid text').attr('font-size', '14px').attr('fill', 'black');
      svg.selectAll('.grid line').attr('stroke', '#646464');
      svg.selectAll('.grid .domain').attr('stroke', '#646464');
    } else {
      this.appendGrid(svg, x, y, width, height);
    }
    
    const keys = configs.map(c => c.key);
    const colorScale = d3.scaleOrdinal<string>().domain(keys).range(d3.schemeCategory10);
    const targetContainer = svg.select('[clipPath="url(#clip)"]').empty() ? svg : svg.select('[clipPath="url(#clip)"]');
    
    this.renderLines(targetContainer, data, configs, x, y, chartName, colorScale);

    if (isTooltip) {
      this.createFocusAndTooltip(svg, width, height, data, configs, x, y, colorScale);
    }

    setTimeout(() => {
      this.toggleLoader(chartName, false);
    }, 0);
  }

  renderLines(targetContainer: any, data: ChartData[], configs: LineConfig[], x: any, y: any, chartName: string, colorScale: any) {
    const maxGap = 5 * 60 * 1000;

    configs.forEach((c) => {
      targetContainer.selectAll(`.${c.key}`).remove();
    });

    const segments: { [key: string]: ChartData[][] } = {};
    configs.forEach((c) => {
      segments[c.key] = [];
      let currentSegment: ChartData[] = [];

      data.forEach((d, i) => {
        const currentTime = d3.isoParse(d.time);
        const previousTime = i > 0 ? d3.isoParse(data[i - 1].time) : null;

        if (currentTime && (!previousTime || currentTime.getTime() - previousTime.getTime() <= maxGap)) {
          currentSegment.push(d);
        } else {
          if (currentSegment.length > 0) segments[c.key].push(currentSegment);
          currentSegment = [d];
        }
      });
      if (currentSegment.length > 0) segments[c.key].push(currentSegment);
    });

    configs.forEach((c) => {
      segments[c.key].forEach((segment, index) => {
        targetContainer
          .append('path')
          .datum(segment)
          .attr('class', c.key)
          .attr('id', `${chartName}_${c.key}_${index}`)
          .attr('fill', 'none')
          .attr('stroke', colorScale(c.key))
          .attr('stroke-width', '2px')
          .attr('d', d3.line<ChartData>()
            .x((d) => {
              const date = d3.isoParse(d.time);
              return x(date ? date : new Date(0));
            })
            .y((d) => {
              const val = +d[c.key];
              return y(isNaN(val) ? 0 : val);
            })
          );
      });
    });
  }

  private renderNoData(svg: any, width: number, height: number) {
    svg.append("text")
      .attr("x", width / 2)
      .attr("y", height / 2)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .style("font-size", "72px")
      .style("fill", "#353535")
      .text("NO DATA");
  }

  private toggleLoader(chartName: string, show: boolean) {
    const loader = document.getElementById('loader' + chartName);
    if (loader) loader.style.display = show ? 'block' : 'none';
  }

  getTimeExtent(data: ChartData[]): [Date, Date] {
    const extent = d3.extent(data, (d) => d.time ? d3.isoParse(d.time) : null) as [Date, Date];
    return extent[0] === undefined || extent[1] === undefined ? [new Date(0), new Date(0)] : extent;
  }

  getScales(extent: [Date, Date], width: number, height: number, daterange?: any) {
    const x = d3.scaleTime().domain(daterange || extent).range([0, width]);
    const y = d3.scaleLinear().domain([0, 800]).range([height, 0]);
    return [x, y];
  }

  appendGrid(svg: any, x: any, y: any, width: number, height: number) {
    const xAxisGrid = d3.axisBottom(x).tickSize(-height)
      .tickFormat((d: any) => d3.timeFormat(width < 1000 ? "%H:%M:%S" : "%d.%m.%y %H:%M:%S")(d));

    const yTicks = y.ticks().filter((t: any) => t !== 0);
    const yAxisGrid = d3.axisLeft(y).tickSize(-width).tickFormat(null).tickValues(yTicks);

    svg.append('g')
      .attr('class', 'grid x-axis')
      .attr('transform', `translate(0, ${height})`)
      .call(xAxisGrid)
      .selectAll('line').attr('stroke', '#646464');

    svg.append('g')
      .attr('class', 'grid y-axis')
      .call(yAxisGrid)
      .selectAll('line').attr('stroke', '#646464');

    svg.selectAll('.grid text').attr('font-size', '14px').attr('fill', 'black');
    svg.selectAll('.grid .domain').attr('stroke', '#646464');
  }

  appendClipPath(svg: any, width: number, height: number) {
    if (!svg) return;
    svg.append('defs')
      .append('clipPath')
      .attr('id', 'clip')
      .append('rect').attr('width', width).attr('height', height).attr('x', 0).attr('y', 0);
  }

  appendChartBody(svg: any) {
    return svg.append('g').attr('clipPath', 'url(#clip)');
  }

  createFocusAndTooltip(svg: any, width: number, height: number, data: ChartData[], configs: LineConfig[], x: any, y: any, colorScale: any) {
    const focus = svg.append('g').attr('class', 'focus-group').style('display', 'none');

    focus.append('line').attr('id', 'focusLineX').attr('class', 'focusLine').style('stroke', 'black').style('stroke-width', '1px').style('stroke-dasharray', '3,3');
    focus.append('line').attr('id', 'focusLineY').attr('class', 'focusLine').style('stroke', 'black').style('stroke-width', '1px').style('stroke-dasharray', '3,3');

    const tooltipGroup = svg.append('g').attr('class', 'svg-tooltip-container').style('opacity', 0);

    configs.forEach((c) => {
      focus.append('circle')
        .attr('id', `focusCircle_${c.key}`)
        .attr('r', 5)
        .attr('class', 'focusCircle')
        .style('fill', colorScale(c.key));
    });

    const tooltipRect = tooltipGroup.append('rect').attr('class', 'tooltip-bg').style('fill', '#ffffff').style('stroke', 'black').style('stroke-width', 1).style('width', '200px').style('pointer-events', 'none').style('rx','15');
    const tooltipText = tooltipGroup.append('text').style('fill', 'black').attr('class', 'tooltip-text').style('font-size', '12px').style('pointer-events', 'none');

    svg.append('rect')
      .attr('class', 'overlay')
      .attr('width', width).attr('height', height)
      .style('fill', 'none').style('pointer-events', 'all')
      .on('mouseover', () => focus.style('display', null))
      .on('mouseout', () => { focus.style('display', 'none'); tooltipGroup.style('opacity', 0); })
      .on('mousemove', (event: any) => this.mousemove(event, x, y, data, configs, focus, tooltipGroup, tooltipRect, tooltipText, width, height, colorScale));
  }

  mousemove(event: any, x: any, y: any, data: ChartData[], configs: LineConfig[], focus: any, tooltipGroup: any, tooltipRect: any, tooltipText: any, width: number, height: number, colorScale: any) {
    const pointer = d3.pointer(event);
    const x0 = x.invert(pointer[0]);

    const bisectDate = d3.bisector<ChartData, Date>(d => d3.isoParse(d.time) || new Date(0)).left;
    const i = bisectDate(data, x0, 1);
    const d0 = data[i - 1]; const d1 = data[i];
    const cursorPosition = pointer[1] <= height / 2 ? 'top' : 'bottom';

    if (d0 && d1) {
      const date0 = d3.isoParse(d0.time); const date1 = d3.isoParse(d1.time);
      if (date0 && date1) {
        const d = x0.getTime() - date0.getTime() > date1.getTime() - x0.getTime() ? d1 : d0;
        const exactDate = d3.isoParse(d.time) || new Date(0);

        focus.select('#focusLineX').attr('x1', x(exactDate)).attr('y1', 0).attr('x2', x(exactDate)).attr('y2', height);
        focus.select('#focusLineY').attr('x1', 0).attr('y1', pointer[1]).attr('x2', width).attr('y2', pointer[1]);

        configs.forEach(c => {
          focus.select(`#focusCircle_${c.key}`).attr('cx', x(exactDate)).attr('cy', y(+d[c.key]));
        });

        const tooltipX = pointer[0] > width / 2 ? pointer[0] - 220 : pointer[0] + 15;
        const tooltipY = cursorPosition === 'top' ? pointer[1] + 10 : pointer[1] - (configs.length * 20 + 30);

        tooltipGroup.attr("transform", `translate(${tooltipX},${tooltipY})`).style("opacity", 1);
        tooltipText.selectAll("tspan").remove();

        tooltipText.append("tspan").attr("x", 5).attr("dy", "1.2em")
          .text(`Время: ${moment(d.time).format("DD.MM.YYYY HH:mm")}`);

        configs.forEach(c => {
          tooltipText.append("tspan")
            .style("fill", colorScale(c.key))
            .attr("x", 5).attr("dy", "1.2em")
            .text(`${c.label}: ${Number(d[c.key]).toFixed(2)}`); 
        });

        const bbox = tooltipText.node().getBBox();
        tooltipRect.attr("width", bbox.width + 10).attr("height", bbox.height + 10).attr("x", -5);
      }
    }
  }

  filterDataByDateRange(data: ChartData[], start: Date, end: Date): ChartData[] {
    return data.filter((d) => {
      const time = d3.isoParse(d.time);
      return time && time >= start && time <= end;
    });
  }

  getXScale(data: ChartData[], width: number): any {
    const extent = this.getTimeExtent(data);
    return d3.scaleTime().domain(extent).range([0, width]);
  }
}