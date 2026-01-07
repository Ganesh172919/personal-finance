import { motion } from "framer-motion";

export function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="flex gap-4 p-4"
    >
      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
        <motion.div
          className="w-4 h-4 bg-primary-foreground rounded-full"
          animate={{ scale: [1, 0.8, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      </div>
      
      <div className="bg-accent/50 rounded-2xl rounded-bl-md px-4 py-3">
        <div className="flex items-center space-x-2">
          <motion.div
            className="w-2 h-2 bg-muted-foreground rounded-full"
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
          />
          <motion.div
            className="w-2 h-2 bg-muted-foreground rounded-full"
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: 0.15 }}
          />
          <motion.div
            className="w-2 h-2 bg-muted-foreground rounded-full"
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: 0.3 }}
          />
        </div>
      </div>
    </motion.div>
  );
}
