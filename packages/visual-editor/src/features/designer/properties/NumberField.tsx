export function NumberField({
	label,
	value,
	onChange,
}: {
	label: string;
	value: number;
	onChange: (value: number) => void;
}) {
	return (
		<label className="flex flex-col gap-1 text-neutral-500 text-xs">
			{label}
			<input
				type="number"
				value={Number.isFinite(value) ? value : 0}
				onChange={(event) => {
					const next = Number.parseFloat(event.target.value);
					if (Number.isFinite(next)) onChange(next);
				}}
				className="rounded border border-neutral-300 px-2 py-1 text-neutral-900 text-sm"
			/>
		</label>
	);
}
