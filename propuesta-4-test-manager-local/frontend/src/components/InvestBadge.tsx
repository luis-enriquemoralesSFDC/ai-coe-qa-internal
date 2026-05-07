import clsx from 'clsx'

interface Props {
  label: string
  score: number
  letter: string
}

export default function InvestBadge({ label, score, letter }: Props) {
  const cls =
    score >= 7 ? 'bg-slds-success-bg text-slds-success border-green-200' :
    score >= 4 ? 'bg-slds-warning-bg text-slds-warning border-yellow-200' :
    'bg-slds-error-bg text-slds-error border-red-200'

  return (
    <div className={clsx('flex flex-col items-center border rounded-slds p-2.5 min-w-[64px]', cls)}>
      <span className="text-lg font-bold leading-none">{letter}</span>
      <span className="text-xs font-medium mt-0.5 leading-none">{label.slice(0, 3)}</span>
      <span className="text-base font-bold mt-1 leading-none">{score.toFixed(1)}</span>
    </div>
  )
}
