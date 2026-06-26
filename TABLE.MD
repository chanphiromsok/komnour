```js
const col = {
    first: { width: "25%" },
    second: { width: "12%" }, // Slightly wider for Khmer text
    third: { grow: true },
};
type CellRender = (
    t: string,
    opts: {
        grow?: boolean;
        width?: number | string;
        color?: any;
    },
    align?: "left" | "right",
) => any;
const headCell: CellRender = (t, opts, align = "left") => {
    const base = TableCell(
        Text(t)
            .font(Fonts.OSSiemReap)
            .size(9)
            .weight("700")
            .letterSpacing(0.5)
            .align(align),
    )
        .paddingTop(8)
        .paddingBottom(8)
        .paddingLeft(10)
        .paddingRight(10);
    return opts.grow ? base.grow(1) : base.width(opts.width!);
};

const dataCell: CellRender = (t, opts, align = "left") => {
    const base = TableCell(
        Text(t)
            .font(Fonts.OSSiemReap)
            .size(10)
            .color(opts?.color ?? "#111827")
            .align(align),
    ) // Adjusted size for Khmer readability
        .paddingTop(4)
        .paddingBottom(4)
        .paddingLeft(4);
    return opts.grow ? base.grow(1) : base.width(opts.width!);
};


Column(
                // Table header row
                TableRow(
                    headCell("ប្រភេទឥណទាន", { width: "14%" }, "left"),
                    CellDivider(),
                    headCell("ទំហំឥណទាន ", col.second, "left"),
                    CellDivider(),
                    headCell("លក្ខខណ្ឌគោលនៃឥណទាន ", col.third),
                ),
                // Divider
                Column().height(1).bg("black"),
                // Line items
                ...items.map((item, i) =>
                    Column(
                        TableRow(
                            // First Row
                            dataCell(item.label, { width: "14%" }, "left").alignSelf(
                                "center",
                            ),
                            //Divider
                            CellDivider(),
                            //Second Row
                            dataCell(
                                item.value,
                                { ...col.second, color: "blue" },
                                "left",
                            ).alignSelf("center"),
                            //Third Row
                            CellDivider(),
                            TableCell(
                                ...subTableItems.map((item, i) =>
                                    Column(
                                        TableRow(
                                            dataCell(item.label, { width: "29%" }, "left"),
                                            CellDivider(),
                                            dataCell("៖", { width: "3%" }, "left"),
                                            CellDivider(),
                                            dataCell(
                                                item.value,
                                                {
                                                    grow: true,
                                                    color: i > 0 ? "blue" : "black",
                                                },
                                                "left",
                                            ),
                                        ),
                                        Row()
                                            .height(1)
                                            .bg(
                                                subTableItems.length - 1 === i
                                                    ? "transparent"
                                                    : "black",
                                            )
                                            .grow(1),
                                    ).width("100%"),
                                ),
                            ).grow(1), // set the conatiner to 100% of width so Row().height(1).grow(1) can expand full inside this container
                        ),
                    ),
                ),
            )
```