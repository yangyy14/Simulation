export { xirr } from './xirr'
export {
  parseCSV,
  loadIndexData,
  IndexDataImpl,
  type IndexData,
} from './data-loader'
export {
  runSimulation,
  validateStrategy,
  generateInvestDates,
  type Strategy,
  type Segment,
  type Transaction,
  type PortfolioSummary,
  type Frequency,
} from './strategy'
export {
  computeMultiplier,
  type SmartConfig,
} from './valuator'
