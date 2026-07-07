export function NumberField({
	label,
	value,
	onChange,
	min,
	max,
}: {
	label: string;
	value: number;
	onChange: (value: number) => void;
	min?: number;
	max?: number;
}) {
	return (
		<label className="flex flex-col gap-1 text-neutral-500 text-xs">
			{label}
			<input
				type="number"
				value={Number.isFinite(value) ? value : 0}
				min={min}
				max={max}
				onChange={(event) => {
					const next = Number.parseFloat(event.target.value);
					if (!Number.isFinite(next)) return;
					const clamped = Math.min(
						max ?? Number.POSITIVE_INFINITY,
						Math.max(min ?? Number.NEGATIVE_INFINITY, next),
					);
					onChange(clamped);
				}}
				className="rounded border border-neutral-300 px-2 py-1 text-neutral-900 text-sm"
			/>
		</label>
	);
}
