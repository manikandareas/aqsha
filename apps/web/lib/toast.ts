import { sileo } from "sileo";
import type { ReactNode } from "react";

type ToastInput = {
  title: string;
  description?: ReactNode | string;
};

export const toast = {
  success: (input: ToastInput) => sileo.success(input),
  error: (input: ToastInput) => sileo.error(input),
  info: (input: ToastInput) => sileo.info(input),
  warning: (input: ToastInput) => sileo.warning(input),
};
