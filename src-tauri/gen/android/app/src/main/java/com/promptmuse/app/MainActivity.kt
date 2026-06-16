package com.promptmuse.app

import android.os.Bundle
import androidx.activity.enableEdgeToEdge

import android.content.Context
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
  companion object {
      var appContext: Context? = null
      
      @JvmStatic
      fun startComfyService(title: String) {
          appContext?.let { ComfyForegroundService.startService(it, title) }
      }
      
      @JvmStatic
      fun updateComfyProgress(title: String, progress: Int) {
          appContext?.let { ComfyForegroundService.updateProgress(it, title, progress) }
      }
      
      @JvmStatic
      fun stopComfyService() {
          appContext?.let { ComfyForegroundService.stopService(it) }
      }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    appContext = this
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    
    // Hide system bars for immersive fullscreen
    val windowInsetsController = WindowCompat.getInsetsController(window, window.decorView)
    windowInsetsController.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    windowInsetsController.hide(WindowInsetsCompat.Type.systemBars())
  }
}
