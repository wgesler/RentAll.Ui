import { TooltipPosition } from "@angular/material/tooltip";
import { PurposefulAny } from "../../../../shared/models/amorphous";

export interface ButtonData {
    name: string;
    callback: (event: PurposefulAny, row: PurposefulAny) => void;
    color: string;
    tooltip: string;
    tooltipPosition: TooltipPosition;
    icon: string;
    suspendOnUpdate: boolean;
}
