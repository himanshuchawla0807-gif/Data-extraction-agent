import * as React from "react"
import { cn } from "../../lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "./avatar"
import { Button } from "./button"
import { MessageLoading } from "./message-loading";

export function ChatBubble({
  variant = "received",
  layout = "default",
  className,
  children,
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 mb-4",
        variant === "sent" && "flex-row-reverse",
        className,
      )}
    >
      {children}
    </div>
  )
}

export function ChatBubbleMessage({
  variant = "received",
  isLoading,
  className,
  children,
}) {
  return (
    <div
      className={cn(
        "rounded-lg p-3 max-w-[85%]",
        variant === "sent"
          ? "bg-black text-white"
          : "bg-gray-100 text-black border border-gray-200",
        className
      )}
    >
      {isLoading ? (
        <div className="flex items-center space-x-2">
          <MessageLoading />
        </div>
      ) : (
        children
      )}
    </div>
  )
}

export function ChatBubbleAvatar({
  src,
  fallback = "AI",
  className,
}) {
  return (
    <Avatar className={cn("h-8 w-8 border border-gray-300", className)}>
      {src && <AvatarImage src={src} />}
      <AvatarFallback className="bg-white text-black font-semibold">{fallback}</AvatarFallback>
    </Avatar>
  )
}

export function ChatBubbleAction({
  icon,
  onClick,
  className,
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("h-6 w-6", className)}
      onClick={onClick}
    >
      {icon}
    </Button>
  )
}

export function ChatBubbleActionWrapper({
  className,
  children,
}) {
  return (
    <div className={cn("flex items-center gap-1 mt-2", className)}>
      {children}
    </div>
  )
}
