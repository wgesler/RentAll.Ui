import { DialogRef } from "@angular/cdk/dialog";
import { MatDialogRef } from "@angular/material/dialog";
import { GenericModalComponent } from "../generic-modal.component";
import { MatIcon } from "@angular/material/icon";

export type GenericModalData = {
    title: string;
    message: string;
    icon: MatIcon;
    iconColor: string;
    no: string;
    yes: string;
    // This function provides the ability to only fire when a button was pressed.
    // If you use the dialogRef.afterClosed() observable, you get a response even if the user didn't press the yes or the no button.
    // You receive events for when the modal is dismissed instead of answered.
    callback: (dialogRef: MatDialogRef<GenericModalComponent>, result: boolean) => void;
    useHTML: boolean;
};

export const defaultGenericModalData = {
    title: 'Confirmation',
    message: 'Are you sure?',
    icon: 'warning',
    iconColor: 'accent',
    no: 'Cancel',
    yes: 'OK',
    callback: (dialogRef: DialogRef, result: boolean) => {
        dialogRef.close(result);
    },
    useHTML: false,
}