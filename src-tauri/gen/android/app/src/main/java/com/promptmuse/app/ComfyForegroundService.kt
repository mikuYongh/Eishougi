package com.promptmuse.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class ComfyForegroundService : Service() {

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val title = intent?.getStringExtra("EXTRA_TITLE") ?: "渲染中..."
        val progress = intent?.getIntExtra("EXTRA_PROGRESS", 0) ?: 0
        
        val notification = createNotification(title, progress)
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
        
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val serviceChannel = NotificationChannel(
                CHANNEL_ID,
                "Render Progress",
                NotificationManager.IMPORTANCE_LOW // Low importance so it doesn't pop up with sound every update
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(serviceChannel)
        }
    }

    private fun createNotification(title: String, progress: Int): Notification {
        // Use default android icon if mipmap/ic_launcher doesn't exist, but it should exist.
        val iconResId = resources.getIdentifier("ic_launcher", "mipmap", packageName)
        
        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(if (progress >= 100) "即将完成..." else "进度: $progress%")
            .setSmallIcon(if (iconResId != 0) iconResId else android.R.drawable.ic_popup_sync)
            .setProgress(100, progress, false)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)

        return builder.build()
    }

    companion object {
        const val CHANNEL_ID = "ComfyForegroundServiceChannel"
        const val NOTIFICATION_ID = 1

        @JvmStatic
        fun startService(context: Context, title: String) {
            val intent = Intent(context, ComfyForegroundService::class.java).apply {
                putExtra("EXTRA_TITLE", title)
                putExtra("EXTRA_PROGRESS", 0)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        @JvmStatic
        fun updateProgress(context: Context, title: String, progress: Int) {
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            manager?.let {
                val iconResId = context.resources.getIdentifier("ic_launcher", "mipmap", context.packageName)
                val notification = NotificationCompat.Builder(context, CHANNEL_ID)
                    .setContentTitle(title)
                    .setContentText(if (progress >= 100) "正在保存..." else "进度: $progress%")
                    .setSmallIcon(if (iconResId != 0) iconResId else android.R.drawable.ic_popup_sync)
                    .setProgress(100, progress, false)
                    .setOngoing(true)
                    .setPriority(NotificationCompat.PRIORITY_LOW)
                    .build()
                it.notify(NOTIFICATION_ID, notification)
            }
        }

        @JvmStatic
        fun stopService(context: Context) {
            val intent = Intent(context, ComfyForegroundService::class.java)
            context.stopService(intent)
            
            // Optionally, we can show a "completed" notification that can be dismissed.
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            manager?.let {
                val iconResId = context.resources.getIdentifier("ic_launcher", "mipmap", context.packageName)
                val notification = NotificationCompat.Builder(context, CHANNEL_ID)
                    .setContentTitle("渲染完成")
                    .setContentText("您的项目已生成完毕")
                    .setSmallIcon(if (iconResId != 0) iconResId else android.R.drawable.ic_dialog_info)
                    .setAutoCancel(true)
                    .setOngoing(false) // No longer ongoing
                    .setProgress(0, 0, false)
                    .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                    .build()
                it.notify(NOTIFICATION_ID + 1, notification) // Use a different ID so they don't conflict
            }
        }
    }
}
