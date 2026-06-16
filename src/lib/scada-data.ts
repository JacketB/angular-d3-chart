export class ChartData {
    [key: string]: number | string; 
    
    constructor(
      public id: number | string,
      public time: string,
    ){}
}

export interface LineConfig {
  key: string;
  label: string;
}

export class ChartLabels {
  constructor(public labels: string[]) {}
}